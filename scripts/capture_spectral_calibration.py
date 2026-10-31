"""Read only bounded calibration CSV members using verified HTTP ranges; never extract tar paths."""

import hashlib
import io
import json
import tarfile
from datetime import UTC, datetime
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
URL = "https://irsa.ipac.caltech.edu/data/SPHEREx/docs/spectral_files_20260812/SPHERExSpectralFiles_202607.tar"


class RangeReader(io.RawIOBase):
    def __init__(self, client):
        self.client = client
        self.offset = 0
        self.start = 0
        self.cache = b""
        self.bytes = 0
        self.requests = 0
        response = client.head(URL)
        response.raise_for_status()
        self.length = int(response.headers["Content-Length"])
        self.modified = response.headers.get("Last-Modified")
        if self.length > 512 * 1024**2:
            raise ValueError("Calibration archive size exceeds reviewed bound")

    def tell(self):
        return self.offset

    def seekable(self):
        return True

    def readable(self):
        return True

    def seek(self, offset, whence=0):
        self.offset = (
            offset if whence == 0 else self.offset + offset if whence == 1 else self.length + offset
        )
        if not 0 <= self.offset <= self.length:
            raise ValueError("Invalid archive offset")
        return self.offset

    def read(self, n=-1):
        if n < 0 or n > 2 * 1024**2:
            raise ValueError("Unbounded member read")
        if self.offset >= self.length:
            return b""
        if not (self.start <= self.offset and self.offset + n <= self.start + len(self.cache)):
            end = min(self.length - 1, self.offset + max(n, 65536) - 1)
            response = self.client.get(
                URL,
                headers={
                    "Range": f"bytes={self.offset}-{end}",
                    "If-Unmodified-Since": self.modified,
                },
            )
            if (
                response.status_code != 206
                or response.headers.get("Content-Range")
                != f"bytes {self.offset}-{end}/{self.length}"
            ):
                raise ValueError("Archive range or version changed")
            self.start = self.offset
            self.cache = response.content
            self.bytes += len(self.cache)
            self.requests += 1
            if self.bytes > 32 * 1024**2 or self.requests > 512:
                raise ValueError("Calibration request budget exceeded")
        result = self.cache[self.offset - self.start : self.offset - self.start + n]
        self.offset += len(result)
        return result


def main():
    output = ROOT / "var/calibration"
    output.mkdir(parents=True, exist_ok=True)
    captures = []
    with httpx.Client(timeout=30, follow_redirects=False) as client:
        reader = RangeReader(client)
        with tarfile.open(fileobj=reader, mode="r:") as archive:
            for index, member in enumerate(archive):
                if index > 4000:
                    raise ValueError("Too many archive entries")
                if (
                    member.isfile()
                    and "/SubChannel17/" in member.name
                    and member.name.endswith(".csv")
                ):
                    if member.size > 256 * 1024:
                        raise ValueError("Oversized calibration member")
                    body = archive.extractfile(member).read(member.size)
                    name = hashlib.sha256(member.name.encode()).hexdigest() + ".csv"
                    (output / name).write_bytes(body)
                    captures.append(
                        {
                            "member": member.name,
                            "sha256": hashlib.sha256(body).hexdigest(),
                            "bytes": len(body),
                            "local_file": name,
                        }
                    )
                    if len(captures) <= 8:
                        print(member.name, body[:150], flush=True)
        receipt = {
            "source_url": URL,
            "archive_length": reader.length,
            "archive_last_modified": reader.modified,
            "retrieved_at_utc": datetime.now(UTC).isoformat(),
            "range_requests": reader.requests,
            "transferred_bytes": reader.bytes,
            "members": captures,
        }
        (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("Captured", len(captures), "members using", reader.bytes, "bytes", flush=True)


if __name__ == "__main__":
    main()
