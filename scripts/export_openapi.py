"""Export only the API contracts currently exposed by the backend scaffold."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app

target = ROOT / "docs/openapi.json"
target.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
print(f"Exported implemented/scaffold API contract to {target.relative_to(ROOT)}")
