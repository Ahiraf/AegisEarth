from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = (
        "postgresql+psycopg://cosmic:local-development-only@localhost:5432/cosmic_motion"
    )
    cors_origins: list[str] = ["http://localhost:5173"]
    service_name: str = "AegisEarth API"
    artifact_root: str = "./var/artifacts"
    provider_user_agent: str = "AegisEarth/0.1 (+https://github.com/Ahiraf/AegisEarth/issues)"
    max_download_bytes: int = Field(134217728, gt=0)
    provider_timeout_seconds: int = Field(30, ge=1, le=120)
    discovery_ttl_seconds: int = Field(900, ge=60, le=86400)
    overlay_ttl_seconds: int = Field(3600, ge=60, le=86400)
    refresh_admin_token: SecretStr | None = None
    refresh_cooldown_seconds: int = Field(300, ge=60, le=86400)
    frontend_viewer_url: str = "http://localhost:5173/viewer"
    embed_ancestors: list[str] = ["'self'"]
    database_transport: Literal["postgresql", "postgrest"] = "postgresql"
    gateway_url: str | None = None
    gateway_token: SecretStr | None = None
    gateway_ca_file: str | None = None
    public_token_secret: SecretStr | None = None
    public_cookie_secure: bool = True
    view_max_active_per_client: int = Field(2, ge=1, le=10)
    view_max_hourly_per_client: int = Field(10, ge=1, le=100)
    view_max_hourly_per_ip: int = Field(30, ge=1, le=300)
    view_max_queue: int = Field(20, ge=1, le=100)
    view_max_workers: int = Field(2, ge=1, le=4)
    view_wall_seconds: int = Field(180, ge=10, le=600)
    view_cpu_seconds: int = Field(60, ge=5, le=300)
    view_memory_mb: int = Field(512, ge=256, le=2048)
    view_total_bytes: int = Field(268435456, ge=1048576, le=536870912)
    object_store: Literal["local", "s3"] = "local"
    s3_bucket: str | None = None
    s3_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    metadata_ranker_enabled: bool = False
    metadata_ranker_wall_seconds: int = Field(600, ge=120, le=900)
    metadata_ranker_max_candidates: int = Field(24, ge=1, le=32)


@lru_cache
def get_settings() -> Settings:
    return Settings()
