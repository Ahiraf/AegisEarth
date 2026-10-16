from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class NeoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    object_type: Literal["asteroid", "comet"]
    diameter_min_km: float | None
    diameter_max_km: float | None
    source_url: str
    retrieved_at: datetime


class NeoPage(BaseModel):
    items: list[NeoRead]
    total: int
    limit: int
    offset: int
