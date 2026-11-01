from fastapi import APIRouter, HTTPException

from app.modules.comparisons.schemas import ComparisonRequest
from app.modules.differencing.processing import difference_gate
from app.modules.views.router import Repository

router = APIRouter(tags=["comparisons"])


@router.post("/comparisons/validate")
def validate_comparison(query: ComparisonRequest, repository: Repository):
    reports = []
    metadata = []
    for ref in query.inputs:
        report = repository.rpc("frame_set_get", {"p_id": str(ref.view_id)})
        if not report or report.get("version") != "frames-v1":
            raise HTTPException(409, detail={"code": "prepared_source_view_required"})
        if ref.index >= len(report["frames"]):
            raise HTTPException(422, detail={"code": "input_frame_not_found"})
        reports.append(report)
        metadata.append(report["frames"][ref.index])
    if query.inputs[0].view_id == query.inputs[1].view_id:
        a, b = sorted(ref.index for ref in query.inputs)
        pair = reports[0]["pair_eligibility"].get(f"{a}:{b}", {})
    else:
        pair = {
            "spectral_display_eligible": False,
            "quantitative_eligible": False,
            "reasons": ["cross_view_pixel_comparison_requires_worker"],
        }
    gate = difference_gate(pair, *metadata)
    if metadata[0]["mid_mjd"] == metadata[1]["mid_mjd"]:
        gate = {
            "eligible": False,
            "reasons": [*gate["reasons"], "distinct_observing_epochs_required"],
        }
    return {
        "operation": "later_minus_earlier",
        "eligibility": gate,
        "pair_evidence": pair,
        "viewer_remains_available": True,
    }
