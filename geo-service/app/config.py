import os
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration settings loaded from environment variables."""

    # MongoDB
    MONGO_URL: str = Field(default="mongodb://localhost:27017")
    MONGO_DB: str = Field(default="geo_db")

    # RabbitMQ
    RABBITMQ_URL: str = Field(default="amqp://guest:guest@localhost:5672/")
    RABBITMQ_EXCHANGE: str = Field(default="parentconnect.events")
    RABBITMQ_USER_REGISTERED_QUEUE: str = Field(default="geo.user_registered")
    RABBITMQ_DLQ: str = Field(default="geo.dlq")

    # Security & JWT
    JWT_ALGORITHM: str = Field(default="RS256")
    JWT_PUBLIC_KEY: str = Field(default="")
    JWT_SECRET: str = Field(default="")
    INTERNAL_API_KEY: str = Field(default="parentconnect-internal-geo-secret-key-32ch")

    # Geo Privacy & Limits
    MAX_SEARCH_RADIUS_M: float = Field(default=10000.0)
    LOCATION_BLUR_M: float = Field(default=200.0)
    BLUR_SALT: str = Field(default="parentconnect-geo-blur-salt-secret")

    # Verification threshold
    ADDRESS_VERIFICATION_THRESHOLD: int = Field(default=2)

    # Observability
    LOG_LEVEL: str = Field(default="INFO")
    SERVICE_NAME: str = Field(default="geo")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    def get_jwt_verification_key(self) -> str:
        """Return the public key or secret depending on the selected algorithm."""
        if self.JWT_ALGORITHM == "RS256":
            # Format public key if escaped newlines were provided
            key = self.JWT_PUBLIC_KEY.strip()
            if "\\n" in key:
                key = key.replace("\\n", "\n")
            return key
        return self.JWT_SECRET


settings = Settings()
