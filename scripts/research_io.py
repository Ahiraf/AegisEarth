"""Bounded, IRSA-only research downloads. Not a public URL-fetch API."""

import hashlib
import time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

USER_AGENT = "CosmicMotionAI-Feasibility/0.1 (+https://github.com/Ahiraf/AegisEarth/issues)"


def validate_url(url):
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "irsa.ipac.caltech.edu"
        or parsed.port not in (None, 443)
        or parsed.username
        or parsed.password
        or not parsed.path.startswith(("/SIA", "/ibe/data/spherex/", "/data/SPHEREx/docs/"))
    ):
        raise ValueError("Only the documented IRSA research resources are allowed")


class IrsaRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(url, path, maximum_bytes, expected_sha256=None):
    """Publish atomically only after a bounded, complete and optionally pinned download."""
    validate_url(url)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    started = time.monotonic()
    try:
        request = Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
        with build_opener(IrsaRedirects()).open(request, timeout=45) as response:
            declared = response.headers.get("Content-Length")
            if declared and int(declared) > maximum_bytes:
                raise ValueError("Declared download exceeds research byte limit")
            total = 0
            with temporary.open("wb") as output:
                while chunk := response.read(64 * 1024):
                    total += len(chunk)
                    if total > maximum_bytes or time.monotonic() - started > 120:
                        raise ValueError("Research download exceeded byte or total-time budget")
                    output.write(chunk)
            if declared and total != int(declared):
                raise ValueError("Incomplete download")
            if expected_sha256 and sha256(temporary) != expected_sha256:
                raise ValueError("Source bytes changed; review provenance before updating the pin")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return round(time.monotonic() - started, 6)
