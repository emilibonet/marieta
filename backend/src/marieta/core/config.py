"""Application configuration via Pydantic v2 settings."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Top-level settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_version: str = "0.1.0"
    log_level: str = "INFO"

    database_url: str = (
        "postgresql+asyncpg://marieta:change-me-in-production@localhost:5432/marieta"
    )
    database_url_sync: str = (
        "postgresql://marieta:change-me-in-production@localhost:5432/marieta"
    )

    redis_url: str = "redis://localhost:6379/0"

    session_secret: str = "change-me-in-production"
    csrf_secret: str = "change-me-in-production"
    session_max_age_seconds: int = 604800

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:latest"

    usda_fdc_api_key: str | None = None

    cors_origins: str = "http://localhost:8080"

    bcrypt_cost: int = 12
    login_rate_limit_per_minute: int = 10
    login_lockout_minutes: int = 5


settings = Settings()
