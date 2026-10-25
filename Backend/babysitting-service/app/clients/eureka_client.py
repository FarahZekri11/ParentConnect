"""
app/clients/eureka_client.py
────────────────────────────
Client HTTP asynchrone pour s'enregistrer auprès du serveur Eureka
(Spring Cloud Netflix Eureka Server).

Fonctionnement :
  1. register()    → POST /eureka/apps/{APP_NAME}    (enregistrement initial)
  2. heartbeat()   → PUT  /eureka/apps/{APP_NAME}/{instance_id}  (toutes les N secondes)
  3. deregister()  → DELETE /eureka/apps/{APP_NAME}/{instance_id} (arrêt propre)

Compatible avec Spring Cloud Eureka REST API :
  https://github.com/Netflix/eureka/wiki/Eureka-REST-operations
"""
from __future__ import annotations

import asyncio
import socket
import time
from typing import Optional

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class EurekaClient:
    """
    Client Eureka léger basé sur httpx async.
    Gère l'enregistrement, les heartbeats périodiques et la désinscription propre.
    """

    def __init__(self) -> None:
        self._settings = settings
        self._instance_id: str = (
            f"{self._settings.EUREKA_INSTANCE_HOST}"
            f":{self._settings.EUREKA_APP_NAME.lower()}"
            f":{self._settings.SERVICE_PORT}"
        )
        self._registered: bool = False
        self._heartbeat_task: Optional[asyncio.Task] = None  # type: ignore[type-arg]

        # Résolution IP locale une seule fois
        try:
            self._ip_addr = socket.gethostbyname(socket.gethostname())
        except OSError:
            self._ip_addr = "127.0.0.1"

    # ──────────────────────────────────────────────────────────────────────────
    # Payload Eureka (format JSON accepté par Spring Cloud Eureka)
    # ──────────────────────────────────────────────────────────────────────────

    def _build_instance_payload(self) -> dict:
        ts = str(int(time.time() * 1000))
        port = self._settings.SERVICE_PORT
        host = self._settings.EUREKA_INSTANCE_HOST
        app = self._settings.EUREKA_APP_NAME.upper()
        base_url = f"http://{host}:{port}"

        return {
            "instance": {
                "instanceId": self._instance_id,
                "hostName": host,
                "app": app,
                "ipAddr": self._ip_addr,
                "status": "UP",
                "overriddenstatus": "UNKNOWN",
                "port": {"$": port, "@enabled": "true"},
                "securePort": {"$": 443, "@enabled": "false"},
                "countryId": 1,
                "dataCenterInfo": {
                    "@class": "com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo",
                    "name": "MyOwn",
                },
                "leaseInfo": {
                    "renewalIntervalInSecs": self._settings.EUREKA_HEARTBEAT_INTERVAL,
                    "durationInSecs": self._settings.EUREKA_LEASE_DURATION,
                    "registrationTimestamp": 0,
                    "lastRenewalTimestamp": 0,
                    "evictionTimestamp": 0,
                    "serviceUpTimestamp": 0,
                },
                "metadata": {"management.port": str(port)},
                "homePageUrl": f"{base_url}/",
                "statusPageUrl": f"{base_url}/health",
                "healthCheckUrl": f"{base_url}/health",
                "vipAddress": app.lower(),
                "secureVipAddress": app.lower(),
                "isCoordinatingDiscoveryServer": "false",
                "lastUpdatedTimestamp": ts,
                "lastDirtyTimestamp": ts,
            }
        }

    # ──────────────────────────────────────────────────────────────────────────
    # URL helpers
    # ──────────────────────────────────────────────────────────────────────────

    @property
    def _app_url(self) -> str:
        """URL de base pour cet app dans Eureka."""
        base = self._settings.EUREKA_SERVER_URL.rstrip("/")
        return f"{base}/apps/{self._settings.EUREKA_APP_NAME.upper()}"

    @property
    def _instance_url(self) -> str:
        return f"{self._app_url}/{self._instance_id}"

    # ──────────────────────────────────────────────────────────────────────────
    # API publique
    # ──────────────────────────────────────────────────────────────────────────

    async def register(self) -> bool:
        """
        Enregistre le service dans Eureka.
        Retourne True si l'enregistrement a réussi, False sinon.
        Ne lève jamais d'exception (Eureka indisponible = warning, pas crash).
        """
        payload = self._build_instance_payload()
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        for attempt in range(1, 4):  # 3 tentatives max
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.post(
                        self._app_url, json=payload, headers=headers
                    )

                if resp.status_code in (200, 204):
                    self._registered = True
                    logger.info(
                        "eureka_registered",
                        app=self._settings.EUREKA_APP_NAME,
                        instance_id=self._instance_id,
                        eureka_url=self._settings.EUREKA_SERVER_URL,
                    )
                    return True
                else:
                    logger.warning(
                        "eureka_register_unexpected_status",
                        status=resp.status_code,
                        body=resp.text[:200],
                        attempt=attempt,
                    )

            except httpx.ConnectError:
                logger.warning(
                    "eureka_unreachable",
                    attempt=attempt,
                    eureka_url=self._settings.EUREKA_SERVER_URL,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("eureka_register_error", attempt=attempt, error=str(exc))

            if attempt < 3:
                await asyncio.sleep(2 ** attempt)  # backoff: 2s, 4s

        logger.warning(
            "eureka_register_failed_all_attempts",
            app=self._settings.EUREKA_APP_NAME,
        )
        return False

    async def send_heartbeat(self) -> bool:
        """Envoie un heartbeat PUT à Eureka. Retourne True si succès."""
        if not self._registered:
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.put(self._instance_url)

            if resp.status_code == 200:
                logger.debug("eureka_heartbeat_ok", instance_id=self._instance_id)
                return True
            elif resp.status_code == 404:
                # Eureka a oublié l'instance (redémarré?) → re-enregistrement
                logger.warning("eureka_instance_lost_re_registering")
                self._registered = False
                return await self.register()
            else:
                logger.warning(
                    "eureka_heartbeat_unexpected", status=resp.status_code
                )
                return False

        except Exception as exc:  # noqa: BLE001
            logger.warning("eureka_heartbeat_error", error=str(exc))
            return False

    async def deregister(self) -> None:
        """Désinscrit l'instance d'Eureka (appelé à l'arrêt du service)."""
        if not self._registered:
            return
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.delete(self._instance_url)
            logger.info(
                "eureka_deregistered",
                status=resp.status_code,
                instance_id=self._instance_id,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("eureka_deregister_error", error=str(exc))
        finally:
            self._registered = False

    async def start_heartbeat_loop(self) -> None:
        """
        Lance la boucle de heartbeat en tâche asyncio de fond.
        S'arrête proprement quand stop_heartbeat() est appelé.
        """
        interval = self._settings.EUREKA_HEARTBEAT_INTERVAL

        async def _loop() -> None:
            logger.info(
                "eureka_heartbeat_loop_started", interval_seconds=interval
            )
            while True:
                await asyncio.sleep(interval)
                await self.send_heartbeat()

        self._heartbeat_task = asyncio.create_task(_loop())

    async def stop_heartbeat(self) -> None:
        """Annule la tâche de heartbeat."""
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            logger.info("eureka_heartbeat_loop_stopped")


# Singleton partagé par le lifespan FastAPI
_eureka_client: Optional[EurekaClient] = None


def get_eureka_client() -> EurekaClient:
    """Retourne (ou crée) l'instance singleton du client Eureka."""
    global _eureka_client
    if _eureka_client is None:
        _eureka_client = EurekaClient()
    return _eureka_client
