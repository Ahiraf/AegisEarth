from typing import Literal

from pydantic import BaseModel

from app.modules.differencing.schemas import DifferenceRequest


class CompatibilityReport(BaseModel):
    observation_ids: list[str]
    compatible: bool
    checks: dict[str, str]
    blocking_reasons: list[str]
    warnings: list[str]
    policy_version: str


class ComparisonRequest(DifferenceRequest):
    contract_version: Literal["comparison-v1"] = "comparison-v1"
