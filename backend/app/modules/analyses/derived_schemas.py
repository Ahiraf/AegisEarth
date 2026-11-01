from uuid import UUID

from pydantic import BaseModel, Field


class DerivedAcceptance(BaseModel):
    id: UUID
    status_url: str
    result_url: str
    cache_hit: bool
    cancel_token: str | None = Field(None, pattern=r"^[0-9a-f]{64}$")
