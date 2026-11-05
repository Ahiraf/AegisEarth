"""Restore the dedicated local test database and a verified artifact into clean destinations."""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.modules.artifacts.storage import LocalStore, StorageError

DATABASE = "cosmic_step11_test"


def db(*args, **kwargs):
    return subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(ROOT / "compose.foundation.yaml"),
            "exec",
            "-T",
            "db",
            *args,
        ],
        check=True,
        timeout=90,
        **kwargs,
    )


def snapshot(name):
    result = db(
        "psql",
        "-XAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "cosmic",
        "-d",
        name,
        "-c",
        "SELECT json_build_object('migration',(SELECT version_num FROM alembic_version),"
        "'jobs',(SELECT count(*) FROM processing_jobs),'views',(SELECT count(*) FROM sky_views),"
        "'snapshots',(SELECT count(*) FROM discovery_snapshots),"
        "'files',(SELECT json_agg(payload ORDER BY id) FROM view_files WHERE published),"
        "'gateway_functions',(SELECT count(*) FROM pg_proc JOIN pg_namespace n "
        "ON n.oid=pronamespace WHERE n.nspname='gateway'));",
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=ROOT / "docs/verification/step11_restore.json"
    )
    parser.add_argument(
        "--artifact-root",
        type=Path,
        required=True,
        help="Store left by the scoped artifact HTTP test",
    )
    args = parser.parse_args()
    restored_db = "cosmic_step11_restore_" + uuid4().hex[:8]
    with tempfile.TemporaryDirectory(prefix="aegis-step11-restore-") as directory:
        root = Path(directory)
        backup = root / "postgres.dump"
        original = snapshot(DATABASE)
        assert (
            original["jobs"] and original["views"] and original["snapshots"] and original["files"]
        )
        with backup.open("wb") as stream:
            db("pg_dump", "-U", "cosmic", "-Fc", DATABASE, stdout=stream)
        db("createdb", "-U", "cosmic", "-T", "template0", restored_db)
        try:
            with backup.open("rb") as stream:
                db("pg_restore", "--exit-on-error", "-U", "cosmic", "-d", restored_db, stdin=stream)
            restored = snapshot(restored_db)
            assert original == restored
        finally:
            db("dropdb", "-U", "cosmic", restored_db)

        (record,) = restored.pop("files")
        original.pop("files")
        store = LocalStore(args.artifact_root)
        with store.open_verified(record) as stream:
            source_bytes = stream.read()
        shutil.copytree(store.root / "objects", root / "objects-backup" / "objects")
        shutil.copytree(root / "objects-backup", root / "objects-restored")
        recovered = LocalStore(root / "objects-restored")
        with recovered.open_verified(record) as stream:
            assert stream.read() == source_bytes
        recovered.path(record["storage_key"]).write_bytes(b"x" * len(source_bytes))
        try:
            with recovered.open_verified(record):
                raise AssertionError("Corrupt backup object was accepted")
        except StorageError as exc:
            assert str(exc) == "artifact_corrupt"

        report = {
            "verified_at_utc": datetime.now(UTC).isoformat(),
            "scope": "disposable PostgreSQL logical backup and local file-store recovery",
            "postgresql": {
                "backup_bytes": backup.stat().st_size,
                "source": original,
                "restored": restored,
            },
            "object": {
                "size_bytes": len(source_bytes),
                "sha256": record["sha256"],
                "verified_using_restored_ledger": True,
                "corruption_rejected": True,
            },
            "external_s3_restore": "requires a hosted bucket",
        }
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
