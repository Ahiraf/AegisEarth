from typing import Literal
from uuid import UUID

from pydantic import Field

from app.core.schemas import StrictRequest


class MetadataRankerRequest(StrictRequest):
    contract_version: Literal["metadata-ranker-v1"]
    method: Literal["metadata_ranker"] = "metadata_ranker"
    snapshot_id: UUID
    visit_index: int = Field(default=0, ge=0)
    max_exposures: int = Field(default=12, ge=6, le=12)
