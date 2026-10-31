from typing import Literal

from pydantic import BaseModel, Field


class MovieArtifact(BaseModel):
    id: str
    url: str
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    content_type: Literal["image/png", "application/fits", "application/json"]
    size_bytes: int = Field(gt=0, le=134217728)


class MovieFrame(BaseModel):
    id: str
    ordinal: int = Field(ge=0)
    kind: Literal["observation", "temporal_bin"]
    time: dict
    preview: MovieArtifact
    science: MovieArtifact | None = None
    science_image_url: str | None = None
    original_inputs: list[dict]
    spatial: dict
    spectral: dict
    stretch: dict
    quality: dict
    warnings: list[str]


class MovieTimeline(BaseModel):
    mode: Literal["common", "native"]
    outcome: Literal["no_data", "single_epoch", "ready_for_animation"]
    frame_count: int = Field(ge=0, le=12)
    distinct_epoch_count: int = Field(ge=0, le=12)
    comparison_supported: bool
    frames_url: str
    first_frame: MovieFrame | None = None
    preload: list[str]
    warnings: list[str]


class MovieManifest(BaseModel):
    manifest_version: Literal["movie-v1"] = "movie-v1"
    manifest_sha256: str
    view_id: str
    source_snapshot_id: str
    source_registry_version: str
    processing_version: str
    job_created_at_utc: str
    request: dict
    default_timeline: Literal["common"] = "common"
    outcome: Literal["no_data", "single_epoch", "ready_for_animation"]
    timelines: dict[str, MovieTimeline]
    playback: dict
    warnings: list[str]
    provenance: dict


class MovieFramePage(BaseModel):
    manifest_version: Literal["movie-v1"] = "movie-v1"
    manifest_sha256: str
    view_id: str
    mode: Literal["common", "native"]
    total: int
    offset: int
    limit: int
    items: list[MovieFrame]
    next_page: str | None
    preload: list[str]
