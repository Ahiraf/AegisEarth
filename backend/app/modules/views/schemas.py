from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.modules.observations.schemas import DiscoveryCriteria, DiscoverySearch
from app.modules.preprocessing.schemas import PreparationOptions


class ViewRequest(DiscoveryCriteria):
    contract_version: Literal["view-v1"]
    max_frames: int = Field(default=6, ge=1, le=12)
    selection_policy: Literal["evenly_spaced_sample"] = "evenly_spaced_sample"

    def discovery(self):
        return DiscoverySearch(
            **self.model_dump(exclude={"contract_version", "max_frames", "selection_policy"}),
            contract_version="discovery-v1",
            limit=100,
        )


class ViewAcceptance(BaseModel):
    id: str
    status_url: str
    job_url: str
    cache_hit: bool
    viewer_execution_available: Literal[False] = False
    cancel_token: str | None = None


class PreparedViewRequest(ViewRequest):
    contract_version: Literal["view-v2"]
    preparation: PreparationOptions = Field(default_factory=PreparationOptions)

    @model_validator(mode="after")
    def compatible_detector(self):
        selected = self.preparation.detector
        if self.preparation.channel_id:
            selected = f"D{(self.preparation.channel_id - 1) // 17 + 1}"
        if selected and self.detectors and selected not in self.detectors:
            raise ValueError("Preparation selection conflicts with discovery detectors")
        return self

    def discovery(self):
        from app.modules.bands.catalog import channel

        data = self.model_dump(
            exclude={"contract_version", "max_frames", "selection_policy", "preparation"}
        )
        selected = self.preparation.detector
        if self.preparation.channel_id:
            selected = channel(self.preparation.channel_id)["detector"]
        if selected:
            if self.detectors and selected not in self.detectors:
                raise ValueError("Preparation detector conflicts with discovery selection")
            data["detectors"] = [selected]
        return DiscoverySearch(**data, contract_version="discovery-v1", limit=100)
