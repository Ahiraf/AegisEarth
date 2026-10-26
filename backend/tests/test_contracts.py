import pytest
from pydantic import ValidationError

from app.modules.analyses.schemas import AnalysisRequest
from app.modules.observations.schemas import ObservationSearch
from app.modules.ranking.contracts import RankingResult
from app.pipeline.registry import STAGES


@pytest.mark.parametrize(
    "changes",
    [
        {"center_ra_deg": 360},
        {"center_dec_deg": 91},
        {"cutout_size_arcmin": 6},
        {"center_ra_deg": float("nan")},
        {"observation_ids": ["a", "a"]},
        {"mode": "sequence", "observation_ids": ["a", "b"]},
        {"url": "https://untrusted.example/file.fits"},
    ],
)
def test_bounded_analysis_request(changes):
    data = {"observation_ids": ["a", "b"], "center_ra_deg": 10, "center_dec_deg": 20}
    data.update(changes)
    with pytest.raises(ValidationError):
        AnalysisRequest(**data)


def test_sequence_contract_and_calibration_gate():
    request = AnalysisRequest(
        observation_ids=["a", "b", "c"], mode="sequence", center_ra_deg=0, center_dec_deg=-90
    )
    assert len(request.observation_ids) == 3
    with pytest.raises(ValidationError):
        RankingResult(score=0.9, score_kind="calibrated_probability", model_version_id="v1")
    assert RankingResult(score=0.9, model_version_id="v1").score_kind == "candidate_score"


def test_search_requires_aware_ordered_times():
    data = {
        "region": {"ra_deg": 12, "dec_deg": -20, "radius_deg": 0.01},
        "start_at": "2025-05-01T00:00:00Z",
        "end_at": "2025-06-01T00:00:00Z",
    }
    assert ObservationSearch(**data).collection == "spherex_qr3"
    data["end_at"] = "2025-04-01T00:00:00Z"
    with pytest.raises(ValidationError):
        ObservationSearch(**data)
    data["end_at"] = "2025-06-01T00:00:00"
    with pytest.raises(ValidationError):
        ObservationSearch(**data)


def test_pipeline_ownership_order_and_no_fabricated_implementation():
    assert STAGES[0].name == "validate_compatibility"
    assert STAGES[-1].name == "publish"
    assert len({stage.name for stage in STAGES}) == len(STAGES)
    assert not any(stage.implemented for stage in STAGES)
