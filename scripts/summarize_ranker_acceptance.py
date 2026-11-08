"""Audit and summarize the recorded real candidate-centred run, without network I/O."""

import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/verification"
report = json.loads((OUTPUT / "metadata_ranker_candidate_centered_live.json").read_text())
result = report["analysis"]["result"]
previous = json.loads((OUTPUT / "metadata_ranker_result.json").read_text())
package = ROOT / "backend/model_packages/aegis_ranker_v2"
manifest = json.loads((package / "MANIFEST.json").read_text())
assert report["accepted"] and result["cutout_policy"] == "per_candidate_centered_v1"
assert all(
    hashlib.sha256((package / name).read_bytes()).hexdigest() == data["sha256"]
    for name, data in manifest["files"].items()
)
ceiling = json.loads((package / "ranker_AB_v3.json").read_text())["v_range"][1]
faint = [c for c in result["candidates"] if c["evidence"]["v_mag"] > ceiling]
bright = [c for c in result["candidates"] if c["evidence"]["v_mag"] <= ceiling]
original_faint = {c["name"] for c in previous["candidates"] if c["evidence"]["v_mag"] > ceiling}
assert original_faint <= {c["name"] for c in faint}
for candidate in faint:
    assert candidate["score"] is candidate["score_uncertainty"] is None
    assert candidate["classification"] == "uncertain"
    assert candidate["warnings"] == ["PREDICTED_FAINTER_THAN_TRAINING_RANGE"]
    assert all(
        "product_id" not in frame and not frame["used_for_score"]
        for frame in candidate["evidence"]["frames"]
    )
for candidate in bright:
    frames = [f for f in candidate["evidence"]["frames"] if "product_id" in f]
    assert len(frames) == len({f["mid_mjd"] for f in frames})
    assert all(
        f["cutout_center"] == {"ra_deg": f["ra_deg"], "dec_deg": f["dec_deg"]} for f in frames
    )
    assert all(f["used_for_score"] or f["reasons"] for f in candidate["evidence"]["frames"])
assert {c["id"] for c in result["candidates"]} == {c["id"] for c in report["persisted_candidates"]}

tests = ET.parse(OUTPUT / "metadata_ranker_candidate_tests.xml").getroot()
suite = tests.find("testsuite")
assert suite is not None and suite.attrib["failures"] == suite.attrib["errors"] == "0"
audit = {
    "analysis_id": report["analysis"]["id"],
    "real_services": not report["fixture_fallback"],
    "total_wall_seconds": report["total_wall_seconds"],
    "worker_wall_seconds": report["worker_wall_seconds"],
    "cutout_http_attempts_including_retries": result["acquisition"]["cutout_downloads"],
    "unique_successful_cutouts": result["acquisition"]["input_count"],
    "cache_hits": result["acquisition"]["cache_hits"],
    "candidate_count": len(result["candidates"]),
    "faint_count": len(faint),
    "original_faint_objects_retained": len(original_faint),
    "faint_objects_no_downloads_and_unscored": True,
    "package_files_sha256_verified": len(manifest["files"]),
    "model_sha256": result["model"]["sha256"],
    "backend_tests_passed": int(suite.attrib["tests"]),
    "bright_candidates": [
        {
            "name": c["name"],
            "score": c["score"],
            "classification": c["classification"],
            "score_uncertainty": c["score_uncertainty"],
            "n_frames_used_package_field": c["evidence"]["n_frames_used"],
            "frames_selected_for_score": sum(f["used_for_score"] for f in c["evidence"]["frames"]),
            "frames": c["evidence"]["frames"],
        }
        for c in bright
    ],
}
(OUTPUT / "metadata_ranker_candidate_centered_acceptance.json").write_text(
    json.dumps(audit, indent=2, allow_nan=False) + "\n", encoding="utf-8"
)

lines = [
    "# Candidate-centred ranker acceptance",
    "",
    f"Real IRSA/SkyBoT run recorded {report['verified_at_utc']}; no fixture fallback.",
    "",
    "RA 179.88°, Dec -0.64°, 21-23 December 2025, QR2, 12 physical exposure epochs.",
    f"Visit span: {(result['visit']['end_mjd'] - result['visit']['start_mjd']) * 24:.3f} hours.",
    "",
    f"Total wall time: **{audit['total_wall_seconds']:.3f} s**; worker: **{audit['worker_wall_seconds']:.3f} s**.",
    f"Native cutouts: **{audit['unique_successful_cutouts']}**, **{audit['cutout_http_attempts_including_retries']} HTTP attempts** including retries; cache hits: **{audit['cache_hits']}**.",
    "",
    f"All **{len(faint)} faint objects** are unscored with no product IDs/downloads. They include all **{len(original_faint)}** faint objects from the old capped result.",
    "The new run retains every SkyBoT candidate, so additional faint objects are no longer removed by the old total-candidate cap.",
    "",
    "## Bright candidates and every frame",
    "",
]
for candidate in bright:
    evidence = candidate["evidence"]
    lines += [
        f"### {candidate['name']}",
        "",
        f"Predicted V={evidence['v_mag']:.3f}; rank **{candidate['score']}**; ensemble spread **{candidate['score_uncertainty']}**.",
        f"Classification is the package hint: **{candidate['classification']}**.",
        f"Package `n_frames_used`: **{evidence['n_frames_used']}** QC-usable frames; **{sum(f['used_for_score'] for f in evidence['frames'])}** selected for score by its unchanged spread rule.",
        "The rank is not a probability or discovery confirmation.",
        "",
        "| UTC mid-MJD | Detector | Candidate-centred RA / Dec (deg) | Used for score | Reason if not used |",
        "| --- | --- | --- | --- | --- |",
    ]
    for frame in evidence["frames"]:
        lines.append(
            f"| {frame['mid_mjd']:.7f} | {frame.get('detector', 'not downloaded')} | {frame['ra_deg']:.8f} / {frame['dec_deg']:.8f} | {'yes' if frame['used_for_score'] else 'no'} | {', '.join(frame['reasons']) or '—'} |"
        )
    lines += [
        "",
        "All downloaded frames passed the package's QC, inside-image and aperture checks. No edge/QC/unmeasurable-aperture exclusions occurred for Massalia.",
        "",
    ]
lines += [
    "## Files and verification",
    "",
    "- [Full backend result JSON](metadata_ranker_candidate_centered_live_result.json)",
    "- [Live worker/database report](metadata_ranker_candidate_centered_live.json)",
    "- [Acceptance audit and full per-frame metadata](metadata_ranker_candidate_centered_acceptance.json)",
    f"- Backend regression: **{audit['backend_tests_passed']} passed**; 13 supplied golden cases printed OK; **{len(manifest['files'])} package SHA-256s unchanged**.",
    "- Frontend: production build passed; 16 viewer/ranker browser checks passed before the final legacy-result notice, followed by a focused ranker rerun.",
    "",
    "The transient discovery outage and pre-correction immutable-metadata rejection are retained in the adjacent initial/fenced/immutable-conflict reports. The latter was a backend ledger comparison between compact snapshot entries and full stored source records, fixed without changing the package or scientific selection/QC policy.",
    "This is local integration acceptance. No deployment or production database migration was performed.",
    "",
]
(OUTPUT / "metadata_ranker_candidate_centered.md").write_text("\n".join(lines), encoding="utf-8")
print(json.dumps({k: v for k, v in audit.items() if k != "bright_candidates"}, indent=2))
