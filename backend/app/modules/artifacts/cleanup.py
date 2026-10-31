"""Bounded, database-led retention. Upload intent is recorded before bytes are written."""

import os
import shutil
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import literal, or_, select, union_all

from app.modules.analyses.jobs import ProcessingJob
from app.modules.preprocessing.models import PreparedArtifact
from app.modules.views.models import SkyView, ViewFile


def cleanup(session, store, settings, *, cursor=None, limit=100):
    # Never enumerate an unbounded S3 bucket. The upload ledger includes failed-attempt objects.
    now = datetime.now(UTC)
    removed = 0
    queries = []
    for name, model in (("raw", ViewFile), ("prepared", PreparedArtifact)):
        queries.append(
            select(model.id.label("id"), literal(name).label("kind"))
            .join(SkyView, model.view_id == SkyView.id)
            .join(ProcessingJob, ProcessingJob.id == SkyView.id)
            .where(
                ~model.storage_deleted,
                ProcessingJob.status.not_in(["queued", "running"]),
                or_(
                    SkyView.expires_at < now,
                    (~model.published) & (ProcessingJob.created_at < now - timedelta(days=1)),
                ),
            )
        )
    combined = union_all(*queries).subquery()
    statement = (
        select(combined.c.id, combined.c.kind).order_by(combined.c.id).limit(min(limit, 100))
    )
    if cursor:
        statement = statement.where(combined.c.id > cursor)
    candidates = list(session.execute(statement))
    last = None
    for identifier, kind in candidates:
        file = session.get(ViewFile if kind == "raw" else PreparedArtifact, identifier)
        store.delete(file.payload["storage_key"])
        file.storage_deleted = True
        session.commit()
        removed += 1
        last = identifier
    stage_root = (Path(settings.artifact_root) / "staging").resolve()
    scanned = 0
    stages = 0
    if stage_root.exists():
        with os.scandir(stage_root) as entries:
            for entry in entries:
                scanned += 1
                if scanned > 100:
                    break
                path = Path(entry.path).resolve()
                if (
                    entry.is_dir(follow_symlinks=False)
                    and path.parent == stage_root
                    and not entry.is_symlink()
                    and time.time() - entry.stat().st_mtime > 86400
                ):
                    shutil.rmtree(path)
                    stages += 1
    return {
        "objects_deleted": removed,
        "staging_directories_deleted": stages,
        "next_cursor": last if removed == min(limit, 100) else None,
    }
