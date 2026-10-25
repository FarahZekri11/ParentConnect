"""
app/core/config.py
──────────────────
Centralised settings loaded from environment variables / .env file.
Uses pydantic-settings so every value is validated at startup.
Access via `get_settings()` which is cached with @lru_cache.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = (
        "postgresql+asyncpg://babysitting:babysitting_pass@localhost:5432/babysitting_db"
    )

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_SECRET: str = "changeme-in-production-use-256bit-random-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ── Identity service ──────────────────────────────────────────────────────
    USE_MOCK_IDENTITY: bool = True
    IDENTITY_SERVICE_URL: str = "http://identity-service:8001"

    # ── Business rules ────────────────────────────────────────────────────────
    # Minimum credit balance allowed (can be negative to allow debt)
    MIN_CREDIT_BALANCE: float = -2.0

    # ── Cache ─────────────────────────────────────────────────────────────────
    CACHE_TTL_SECONDS: int = 300

    # ── Logging / environment ──────────────────────────────────────────────────
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    ENVIRONMENT: Literal["development", "production", "test"] = "development"

    # ── Service ───────────────────────────────────────────────────────────────
    SERVICE_PORT: int = 8002
    SERVICE_NAME: str = "babysitting-service"
    SERVICE_VERSION: str = "0.1.0"

    # ── Eureka Service Discovery ───────────────────────────────────────────────
    # URL du serveur Eureka (local sans Docker : http://localhost:8761/eureka/)
    EUREKA_SERVER_URL: str = "http://localhost:8761/eureka/"
    # Nom sous lequel le service s'enregistre dans Eureka (majuscules Eureka)
    EUREKA_APP_NAME: str = "PARENTCONNECT-BABYSITTING"
    # Adresse réseau annoncée aux autres services (localhost en mode local)
    EUREKA_INSTANCE_HOST: str = "localhost"
    # Intervalle entre chaque heartbeat (secondes)
    EUREKA_HEARTBEAT_INTERVAL: int = 30
    # Durée du bail Eureka (secondes) - doit être > heartbeat
    EUREKA_LEASE_DURATION: int = 90
    # Activer/désactiver l'enregistrement Eureka
    EUREKA_ENABLED: bool = True

    # ── Derived helpers ───────────────────────────────────────────────────────
    @field_validator("DATABASE_URL")
    @classmethod
    def validate_db_url(cls, v: str) -> str:
        if not v.startswith("postgresql"):
            raise ValueError("DATABASE_URL must be a PostgreSQL URL")
        return v

    @field_validator("REDIS_URL")
    @classmethod
    def validate_redis_url(cls, v: str) -> str:
        if not v.startswith("redis"):
            raise ValueError("REDIS_URL must be a Redis URL")
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_test(self) -> bool:
        return self.ENVIRONMENT == "test"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


@lru_cache
def get_settings() -> Settings:
    """Return cached Settings instance. Override in tests via dependency injection."""
    return Settings()
