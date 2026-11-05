"""Render PNGs for the fixed saved catalog from IRSA SPHEREx FITS cutouts."""

import argparse
import hashlib
import io
import json
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode

import astropy.units as u
import httpx
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.modules.cutouts.acquisition import AcquisitionError, download
from app.modules.observations.feasibility import valid_pixels
from app.modules.preprocessing.display import preview, stretch_limits
from app.modules.registration.grid import make_grid, sample_bilinear
from app.modules.targets.coordinates import RectangularRegion

CATALOG = ROOT / "frontend/src/archive/products.json"
OUTPUT = ROOT / "frontend/public/archive-previews"
FIELDS = {"m101": (210.80227, 54.34895), "tutorial": (304.693508808, 42.4436872991)}
NAME = re.compile(
    r"level2_((\d{4}W\d{2}_\d[A-Z])_\d{4}_\d+)D([1-6])_spx_(l2b-v\d+-\d{4}-\d{3})\.fits"
)


class MirrorFile(io.RawIOBase):
    """Seekable FITS source that reads only the byte ranges Astropy requests."""

    def __init__(self, client, url):
        self.client, self.url = client, url
        response = client.head(url)
        response.raise_for_status()
        self.size = int(response.headers["Content-Length"])
        self.position = self.received = 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=io.SEEK_SET):
        bases = {io.SEEK_SET: 0, io.SEEK_CUR: self.position, io.SEEK_END: self.size}
        self.position = bases[whence] + offset
        return self.position

    def read(self, count=-1):
        if count == 0 or self.position >= self.size:
            return b""
        end = min(self.size - 1, self.position + count - 1)
        if count < 0 or end - self.position + 1 + self.received > 12 * 1024**2:
            raise ValueError("FITS preview range budget exceeded")
        expected = f"bytes {self.position}-{end}/{self.size}"
        length = end - self.position + 1
        with self.client.stream(
            "GET", self.url, headers={"Range": f"bytes={self.position}-{end}"}
        ) as response:
            if response.status_code != 206 or response.headers.get("Content-Range") != expected:
                raise ValueError("Unexpected FITS range response")
            body = bytearray()
            for chunk in response.iter_bytes(65536):
                body.extend(chunk)
                if len(body) > length:
                    raise ValueError("Unexpected FITS range length")
        if len(body) != length:
            raise ValueError("Incomplete FITS range response")
        self.position += len(body)
        self.received += len(body)
        return bytes(body)


def mirror_cutout(url, path, world):
    with (
        httpx.Client(timeout=httpx.Timeout(30, connect=10)) as client,
        fits.open(MirrorFile(client, url), memmap=False) as hdus,
    ):
        image = hdus["IMAGE"]
        _, y = WCS(image.header).celestial.world_to_pixel_values(*world)
        start = max(0, int(np.floor(y.min())) - 2)
        stop = min(image.shape[0], int(np.ceil(y.max())) + 3)
        planes = [fits.PrimaryHDU()]
        for name in ("IMAGE", "VARIANCE", "FLAGS"):
            original = hdus[name]
            header = original.header.copy()
            if "CRPIX2" in header:
                header["CRPIX2"] -= start
            planes.append(fits.ImageHDU(original.section[start:stop, :], header=header, name=name))
        fits.HDUList(planes).writeto(path, checksum=True)


def render(field, records, inputs, fetch):
    ra, dec = FIELDS[field]
    region = RectangularRegion(ra=ra, dec=dec, width_arcmin=5, height_arcmin=5).geometry()
    grid, shape = make_grid(region)
    yy, xx = np.indices(shape)
    world = grid.pixel_to_world_values(xx, yy)
    frames = []
    for name in records:
        matched = NAME.fullmatch(name)
        if not matched:
            raise ValueError(f"Unknown product name: {name}")
        obs_id, period, detector, version = matched.groups()
        source = f"https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/level2/{period}/{version}/{detector}/{name}"
        cutout = (
            source
            + "?"
            + urlencode({"center": f"{ra},{dec}deg", "size": "6arcmin", "gzip": "false"})
        )
        path = inputs / name
        mirror_path = path.with_suffix(".mirror.fits")
        mirror = source.replace(
            "https://irsa.ipac.caltech.edu/ibe/data/spherex/",
            "https://nasa-irsa-spherex.s3.us-east-1.amazonaws.com/",
        )
        if fetch and not path.is_file() and not mirror_path.is_file():
            try:
                download(cutout, path, 12 * 1024**2)
            except AcquisitionError:
                mirror_cutout(mirror, mirror_path, world)
        from_mirror = not path.is_file() and mirror_path.is_file()
        if from_mirror:
            path = mirror_path
        with fits.open(path, memmap=False, lazy_load_hdus=False) as hdus:
            header = hdus["IMAGE"].header
            if header["OBSID"] != obs_id or int(header["DETECTOR"]) != int(detector):
                raise ValueError(f"FITS identity mismatch: {name}")
            image_shape = hdus["IMAGE"].shape
            if (
                len(image_shape) != 2
                or min(image_shape) < 50
                or max(image_shape) > (2048 if from_mirror else 100)
            ):
                raise ValueError(f"Unexpected FITS image shape: {name}")
            last = hdus[-1].fileinfo()
            if last["datLoc"] + last["datSpan"] > path.stat().st_size:
                raise ValueError(f"Truncated FITS product: {name}")
            if header["TIMESYS"] != "UTC" or u.Unit(header["BUNIT"]) != u.MJy / u.sr:
                raise ValueError(f"Unsupported time or flux units: {name}")
            observed = header["DATE-AVG"]
            x, y = WCS(header).celestial.world_to_pixel_values(*world)
            mask, _, _ = valid_pixels(hdus)
            arrays, valid = sample_bilinear(hdus["IMAGE"].data, hdus["VARIANCE"].data, mask, x, y)
        frame = {"science": arrays[0], "valid": valid}
        if not frame["valid"].any():
            raise ValueError(f"No usable display pixels: {name}")
        with path.open("rb") as stream:
            checksum = hashlib.file_digest(stream, "sha256").hexdigest()
        frames.append(
            (
                frame,
                {
                    "product": name,
                    "source_url": source,
                    "input_url": mirror if from_mirror else cutout,
                    "input_kind": "local_row_cutout" if from_mirror else "irsa_cutout",
                    "fits_sha256": checksum,
                    "observed_at_utc": observed,
                    "field_arcmin": 5,
                    "center_icrs_deg": [ra, dec],
                },
            )
        )

    limits = stretch_limits(
        [frame["science"] for frame, _ in frames], [frame["valid"] for frame, _ in frames]
    )
    receipts = []
    for frame, receipt in frames:
        png = Path(receipt["product"]).with_suffix(".png").name
        path = OUTPUT / png
        preview(path, frame["science"], frame["valid"], limits)
        receipts.append(
            {
                **receipt,
                "png": png,
                "png_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "stretch_limits_mjy_sr": limits,
            }
        )
        print(png, shape, flush=True)
    return receipts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "var/archive-previews")
    parser.add_argument("--fetch-missing", action="store_true")
    args = parser.parse_args()
    args.input.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rows = json.loads(CATALOG.read_text(encoding="utf-8"))
    previews = [
        item
        for field in FIELDS
        for item in render(
            field,
            [row["file"] for row in rows if row["field"] == field],
            args.input,
            args.fetch_missing,
        )
    ]
    CATALOG.with_name("previews.json").write_text(
        json.dumps(
            {"generated_at_utc": datetime.now(UTC).isoformat(), "previews": previews}, indent=2
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
