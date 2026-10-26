from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = (
        "postgresql+psycopg://cosmic:local-development-only@localhost:5432/cosmic_motion"
    )
    cors_origins: list[str] = ["http://localhost:5173"]
    service_name: str = "Cosmic Motion AI API"
    artifact_root: str = "./var/artifacts"
    provider_user_agent: str = "CosmicMotionAI/0.1 (+https://github.com/Ahiraf/AegisEarth/issues)"
    max_download_bytes: int = Field(134217728, gt=0)
    provider_timeout_seconds: int = Field(30, ge=1, le=120)


@lru_cache
def get_settings() -> Settings:
    return Settings()
