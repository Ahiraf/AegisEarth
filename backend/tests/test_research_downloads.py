"""Regression checks for incomplete research downloads observed during live probing."""

import io
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import ClassVar

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import research_io

URL = "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/test.fits"


class Response(io.BytesIO):
    headers: ClassVar[dict[str, str]] = {"Content-Length": "4"}


@pytest.mark.parametrize(
    ("payload", "limit", "expected", "reason"),
    [
        (b"ab", 4, None, "Incomplete"),
        (b"abcd", 3, None, "byte limit"),
        (b"abcd", 4, "wrong-checksum", "Source bytes changed"),
    ],
)
def test_bad_download_does_not_replace_valid_cache(
    monkeypatch, tmp_path, payload, limit, expected, reason
):
    monkeypatch.setattr(
        research_io,
        "build_opener",
        lambda *_: SimpleNamespace(open=lambda *args, **kwargs: Response(payload)),
    )
    destination = tmp_path / "pinned.fits"
    destination.write_bytes(b"existing-valid-cache")
    with pytest.raises(ValueError, match=reason):
        research_io.download(URL, destination, limit, expected)
    assert destination.read_bytes() == b"existing-valid-cache"
    assert not destination.with_suffix(".fits.part").exists()


def test_redirect_cannot_leave_irsa():
    with pytest.raises(ValueError, match="IRSA"):
        research_io.IrsaRedirects().redirect_request(
            None, None, 302, "", {}, "https://example.com/data"
        )
