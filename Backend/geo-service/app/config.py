import os
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration settings loaded from environment variables."""

    # Server & Port (0.0.0.0:8080)
    HOST: str = Field(default="0.0.0.0")
    PORT: int = Field(default=8080)
    APP_PORT: int = Field(default=8080)

    # MongoDB
    MONGO_URL: str = Field(default="mongodb://localhost:27017")
    MONGO_DB: str = Field(default="geo_db")

    # RabbitMQ
    RABBITMQ_HOST: str = Field(default="rabbitmq")
    RABBITMQ_PORT: int = Field(default=5672)
    RABBITMQ_USER: str = Field(default="guest")
    RABBITMQ_PASSWORD: str = Field(default="guest")
    RABBITMQ_URL: str = Field(default="")
    RABBITMQ_EXCHANGE: str = Field(default="parentconnect.topic")
    RABBITMQ_USER_REGISTERED_QUEUE: str = Field(default="geo_events_queue")
    RABBITMQ_EVENTS_QUEUE: str = Field(default="geo_events_queue")
    RABBITMQ_DLQ: str = Field(default="geo.dlq")

    # Security & Keycloak (RS256)
    KEYCLOAK_REALM_PUBLIC_KEY: str = Field(default="")
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

    # Eureka Service Discovery
    EUREKA_ENABLED: bool = Field(default=True)
    EUREKA_SERVER_URL: str = Field(
        default="http://eureka-server:8761/eureka/"
    )
    EUREKA_APP_NAME: str = Field(default="PARENTCONNECT-GEO-SERVICE")
    EUREKA_INSTANCE_HOST: str = Field(default="geo-service")
    EUREKA_INSTANCE_PORT: int = Field(default=8080)
    EUREKA_HEARTBEAT_INTERVAL: int = Field(default=30)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    def get_effective_port(self) -> int:
        """Return port from PORT or APP_PORT."""
        env_port = os.getenv("PORT") or os.getenv("APP_PORT")
        if env_port:
            try:
                return int(env_port)
            except ValueError:
                pass
        return self.PORT or self.APP_PORT or 8080

    def get_rabbitmq_url(self) -> str:
        """Return configured RABBITMQ_URL or build from host/port."""
        if self.RABBITMQ_URL and self.RABBITMQ_URL.strip():
            return self.RABBITMQ_URL.strip()
        return f"amqp://{self.RABBITMQ_USER}:{self.RABBITMQ_PASSWORD}@{self.RABBITMQ_HOST}:{self.RABBITMQ_PORT}/"

    def get_jwt_verification_key(self) -> str:
        """Return the public key or secret depending on the selected algorithm."""
        if self.JWT_ALGORITHM == "RS256":
            # Priority to KEYCLOAK_REALM_PUBLIC_KEY, fallback to JWT_PUBLIC_KEY
            key = self.KEYCLOAK_REALM_PUBLIC_KEY.strip() or self.JWT_PUBLIC_KEY.strip()
            if not key:
                return ""
            if "\\n" in key:
                key = key.replace("\\n", "\n")
            # Wrap in PEM headers if raw Base64 string is provided
            if not key.startswith("-----BEGIN"):
                key = f"-----BEGIN PUBLIC KEY-----\n{key}\n-----END PUBLIC KEY-----"
            return key
        return self.JWT_SECRET


settings = Settings()
