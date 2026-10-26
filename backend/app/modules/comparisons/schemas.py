from pydantic import BaseModel


class CompatibilityReport(BaseModel):
    observation_ids: list[str]
    compatible: bool
    checks: dict[str, str]
    blocking_reasons: list[str]
    warnings: list[str]
    policy_version: str
