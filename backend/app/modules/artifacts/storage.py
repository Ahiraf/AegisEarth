"""Immutable bounded local/S3 storage. Public callers see artifact IDs, never storage keys."""

import base64
import hashlib
import os
import re
import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlsplit


class StorageError(Exception):
    pass


def safe_key(key):
    if not re.fullmatch(
        r"objects/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(?:fits|png|json)", key
    ):
        raise StorageError("invalid_storage_key")
    return key


def verify_stream(stream, record):
    size, digest = 0, hashlib.sha256()
    while chunk := stream.read(65536):
        size += len(chunk)
        if size > min(record["size_bytes"], 134217728):
            raise StorageError("artifact_corrupt")
        digest.update(chunk)
    if size != record["size_bytes"] or digest.hexdigest() != record["sha256"]:
        raise StorageError("artifact_corrupt")
    stream.seek(0)


class LocalStore:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key):
        path = (self.root / safe_key(key)).resolve()
        if not path.is_relative_to(self.root):
            raise StorageError("invalid_storage_key")
        return path

    def put(self, path, record):
        target = self.path(record["storage_key"])
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".part")
        try:
            with Path(path).open("rb") as stream:
                verify_stream(stream, record)
                with temporary.open("xb") as out:
                    shutil.copyfileobj(stream, out, 65536)
                    out.flush()
                    os.fsync(out.fileno())
            try:
                os.link(temporary, target)
            except FileExistsError:
                with self.open_verified(record):
                    pass
        finally:
            temporary.unlink(missing_ok=True)

    @contextmanager
    def open_verified(self, record):
        try:
            with self.path(record["storage_key"]).open("rb") as stream:
                verify_stream(stream, record)
                yield stream
        except OSError as exc:
            raise StorageError("artifact_unavailable") from exc

    def delete(self, key):
        path = self.path(key)
        path.unlink(missing_ok=True)
        path.with_suffix(".part").unlink(missing_ok=True)


class S3Store:
    def __init__(self, settings, *, client=None):
        import boto3
        from botocore.config import Config

        endpoint = urlsplit(settings.s3_endpoint_url or "https://s3.amazonaws.com")
        if (
            endpoint.scheme != "https"
            or not endpoint.hostname
            or endpoint.username
            or endpoint.password
            or endpoint.query
            or endpoint.fragment
        ):
            raise ValueError("S3 requires a credential-free HTTPS endpoint")
        if not settings.s3_bucket or not re.fullmatch(
            r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", settings.s3_bucket
        ):
            raise ValueError("S3 bucket is required")
        self.bucket = settings.s3_bucket
        self.client = client or boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            config=Config(
                connect_timeout=5,
                read_timeout=10,
                retries={"total_max_attempts": 2},
                s3={"addressing_style": "path"},
                request_checksum_calculation="when_required",
            ),
        )

    def put(self, path, record):
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            with Path(path).open("rb") as stream:
                verify_stream(stream, record)
                self.client.put_object(
                    Bucket=self.bucket,
                    Key=safe_key(record["storage_key"]),
                    Body=stream,
                    ContentLength=record["size_bytes"],
                    ContentType=record.get("content_type", "application/fits"),
                    IfNoneMatch="*",
                    ChecksumSHA256=base64.b64encode(bytes.fromhex(record["sha256"])).decode(),
                    Metadata={"sha256": record["sha256"]},
                )
        except ClientError as exc:
            if exc.response["ResponseMetadata"]["HTTPStatusCode"] == 412:
                with self.open_verified(record):
                    pass
            else:
                raise StorageError("object_store_unavailable") from exc
        except (BotoCoreError, OSError) as exc:
            raise StorageError("object_store_unavailable") from exc

    @contextmanager
    def open_verified(self, record):
        from botocore.exceptions import BotoCoreError, ClientError

        body = None
        try:
            result = self.client.get_object(Bucket=self.bucket, Key=safe_key(record["storage_key"]))
            body = result["Body"]
            if (
                result["ContentLength"] != record["size_bytes"]
                or result["ContentLength"] > 134217728
            ):
                raise StorageError("artifact_corrupt")
            with tempfile.TemporaryFile() as stream:
                total = 0
                while chunk := body.read(65536):
                    total += len(chunk)
                    if total > record["size_bytes"]:
                        raise StorageError("artifact_corrupt")
                    stream.write(chunk)
                stream.seek(0)
                verify_stream(stream, record)
                yield stream
        except (BotoCoreError, ClientError, OSError) as exc:
            raise StorageError("object_store_unavailable") from exc
        finally:
            if body:
                body.close()

    def delete(self, key):
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            self.client.delete_object(Bucket=self.bucket, Key=safe_key(key))
        except (BotoCoreError, ClientError) as exc:
            raise StorageError("object_store_unavailable") from exc


def get_store(settings):
    return (
        LocalStore(settings.artifact_root)
        if settings.object_store == "local"
        else S3Store(settings)
    )
