from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://aegis:local-development-only@localhost:5432/aegisearth"
    cors_origins: list[str] = ["http://localhost:5173"]
    nasa_api_key: str = "DEMO_KEY"
    static_dir: str = "static"


@lru_cache
def get_settings() -> Settings:
    return Settings()
