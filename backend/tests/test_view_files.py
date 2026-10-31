import hashlib
import io
from types import SimpleNamespace
from uuid import uuid4

import boto3
import httpx
import numpy as np
import pytest
from astropy.io import fits
from botocore.response import StreamingBody
from botocore.stub import ANY, Stubber

from app.core.config import Settings
from app.modules.artifacts.storage import LocalStore, S3Store, StorageError
from app.modules.cutouts.acquisition import AcquisitionError, cutout_url, download, validate_fits
from app.modules.observations.provider import ProviderError
from app.modules.views.security import PublicTokens
from app.modules.views.worker import WorkerLimit, resource_guard


def make_fits(path, *, size=12, obsid="2026W34_1A_0363_1"):
    image = fits.ImageHDU(np.ones((size, size), dtype=np.float32), name="IMAGE")
    image.header.update(
        {
            "TIMESYS": "UTC",
            "OBSID": obsid,
            "DETECTOR": 2,
            "CTYPE1": "RA---TAN",
            "CTYPE2": "DEC--TAN",
            "BUNIT": "MJy/sr",
        }
    )
    fits.HDUList(
        [
            fits.PrimaryHDU(),
            image,
            fits.ImageHDU(image.data, name="VARIANCE"),
            fits.ImageHDU(np.zeros((size, size), dtype=np.int32), name="FLAGS"),
            fits.ImageHDU(image.data, name="ZODI"),
            fits.BinTableHDU(name="WCS-WAVE"),
            fits.ImageHDU(np.ones((1, 3, 3)), name="PSF"),
        ]
    ).writeto(path, checksum=True)
    return path


def product():
    return {
        "id": "e" * 64,
        "release": "qr2",
        "detector": "D2",
        "exposure_key": "spherex:2026W34_1A_0363_1:D2",
        "access_url": "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/level2/2026W34_1A/l2b-v20-2025-247/2/level2_2026W34_1A_0363_1D2_spx_l2b-v20-2025-247.fits",
    }


def record(body):
    sha = hashlib.sha256(body).hexdigest()
    return {
        "sha256": sha,
        "size_bytes": len(body),
        "storage_key": f"objects/{uuid4()}/{uuid4()}/{sha}.fits",
    }


def test_truncation_change_size_and_redirect_never_publish(tmp_path):
    path = tmp_path / "download.fits"
    for body, length, status, expected in [
        (b"abc", "5", 200, None),
        (b"abc", "30", 200, None),
        (b"abc", "3", 302, None),
        (b"abc", "3", 200, "f" * 64),
    ]:
        transport = httpx.MockTransport(
            lambda req, b=body, n=length, s=status: httpx.Response(
                s, headers={"Content-Length": n}, stream=httpx.ByteStream(b)
            )
        )
        with pytest.raises(AcquisitionError):
            download(product()["access_url"], path, 10, expected=expected, transport=transport)
        assert not path.exists() and not path.with_suffix(".part").exists()


def test_bounded_download_and_real_fits_structure(tmp_path):
    source = make_fits(tmp_path / "input.fits")
    body = source.read_bytes()
    path = tmp_path / "download.fits"
    transport = httpx.MockTransport(
        lambda req: httpx.Response(
            200, headers={"Content-Length": str(len(body))}, stream=httpx.ByteStream(body)
        )
    )
    receipt = download(product()["access_url"], path, len(body), transport=transport)
    assert receipt["sha256"] == hashlib.sha256(body).hexdigest()
    limits = {"max_decoded_bytes": 67108864, "max_science_dimension": 512}
    assert validate_fits(path, product(), limits)["structurally_validated"]
    with pytest.raises(AcquisitionError):
        validate_fits(path, {**product(), "detector": "D3"}, limits)
    with pytest.raises(AcquisitionError):
        validate_fits(path, product(), {**limits, "max_decoded_bytes": 10})
    oversized = make_fits(tmp_path / "large.fits", size=513)
    with pytest.raises(AcquisitionError, match="fits_science_dimensions_exceeded"):
        validate_fits(oversized, product(), limits)
    path.write_bytes(body[:-2880])
    with pytest.raises(AcquisitionError):
        validate_fits(path, product(), limits)


def test_cutout_links_are_trusted_and_padding_preserves_fov():
    from app.modules.targets.coordinates import RectangularRegion

    geometry = RectangularRegion(ra=0, dec=90, width_arcmin=30, height_arcmin=30).geometry()
    url = cutout_url(product(), geometry)
    assert "center=0.000000000000%2C90.000000000000" in url
    with pytest.raises(ProviderError, match="unsafe_source_link"):
        cutout_url({**product(), "access_url": "https://evil.test/file.fits"}, geometry)


def test_local_store_immutable_integrity_and_path_safety(tmp_path):
    body = b"a valid bounded blob"
    source = tmp_path / "source"
    source.write_bytes(body)
    file = record(body)
    store = LocalStore(tmp_path / "objects-root")
    store.put(source, file)
    store.put(source, file)
    with store.open_verified(file) as stream:
        assert stream.read() == body
    for key in ["../escape", "objects/../bad", str(tmp_path / "absolute")]:
        with pytest.raises(StorageError):
            store.delete(key)
    store.path(file["storage_key"]).write_bytes(b"corrupt")
    with pytest.raises(StorageError, match="artifact_corrupt"):
        store.put(source, file)
    store.delete(file["storage_key"])
    store.delete(file["storage_key"])


def test_s3_sdk_contract_hash_verification_and_delete(tmp_path):
    client = boto3.client(
        "s3", region_name="us-east-1", aws_access_key_id="fixture", aws_secret_access_key="fixture"
    )
    store = S3Store(Settings(_env_file=None, s3_bucket="cosmic-fixture"), client=client)
    body = b"bounded S3 fixture"
    file = record(body)
    source = tmp_path / "source"
    source.write_bytes(body)
    with Stubber(client) as stub:
        stub.add_response(
            "put_object",
            {},
            {
                "Bucket": "cosmic-fixture",
                "Key": file["storage_key"],
                "Body": ANY,
                "ContentLength": len(body),
                "ContentType": "application/fits",
                "IfNoneMatch": "*",
                "ChecksumSHA256": ANY,
                "Metadata": {"sha256": file["sha256"]},
            },
        )
        store.put(source, file)
        stub.add_response(
            "get_object",
            {"Body": StreamingBody(io.BytesIO(body), len(body)), "ContentLength": len(body)},
            {"Bucket": "cosmic-fixture", "Key": file["storage_key"]},
        )
        with store.open_verified(file) as stream:
            assert stream.read() == body
        corrupt = b"x" * len(body)
        stub.add_response(
            "get_object",
            {
                "Body": StreamingBody(io.BytesIO(corrupt), len(corrupt)),
                "ContentLength": len(corrupt),
            },
            {"Bucket": "cosmic-fixture", "Key": file["storage_key"]},
        )
        with pytest.raises(StorageError, match="artifact_corrupt"), store.open_verified(file):
            pass
        stub.add_response(
            "delete_object", {}, {"Bucket": "cosmic-fixture", "Key": file["storage_key"]}
        )
        store.delete(file["storage_key"])
        stub.assert_no_pending_responses()


def test_scoped_tokens_are_not_forgeable_or_shared():
    tokens = PublicTokens(Settings(_env_file=None, public_token_secret="fixture-secret-" * 4))
    cookie, scope = tokens.session(None)
    assert tokens.session(cookie) == (cookie, scope)
    assert tokens.session(cookie[:-1] + ("a" if cookie[-1] != "a" else "b"))[1] != scope
    assert tokens.cancel_token("job-a", scope) != tokens.cancel_token("job-b", scope)
    with pytest.raises(ValueError):
        PublicTokens(Settings(_env_file=None))


def test_wall_cpu_memory_and_disk_limits(tmp_path, monkeypatch):
    import time

    process = SimpleNamespace(pid=123)
    limits = {"wall_seconds": 10, "memory_mb": 256, "cpu_seconds": 5, "total_bytes": 1}
    with pytest.raises(WorkerLimit, match="wall_time_exceeded"):
        resource_guard(process, time.monotonic() - 11, limits, tmp_path)
    fake = SimpleNamespace(
        children=lambda recursive: [],
        is_running=lambda: True,
        memory_info=lambda: SimpleNamespace(rss=300 * 1024**2),
        cpu_times=lambda: SimpleNamespace(user=0, system=0),
    )
    monkeypatch.setattr("app.modules.views.worker.psutil.Process", lambda _: fake)
    with pytest.raises(WorkerLimit, match="memory_limit_exceeded"):
        resource_guard(process, time.monotonic(), limits, tmp_path)
    fake.memory_info = lambda: SimpleNamespace(rss=0)
    fake.cpu_times = lambda: SimpleNamespace(user=6, system=0)
    with pytest.raises(WorkerLimit, match="cpu_limit_exceeded"):
        resource_guard(process, time.monotonic(), limits, tmp_path)
    fake.cpu_times = lambda: SimpleNamespace(user=0, system=0)
    (tmp_path / "large.part").write_bytes(b"0" * 1048578)
    with pytest.raises(WorkerLimit, match="disk_limit_exceeded"):
        resource_guard(process, time.monotonic(), limits, tmp_path)
