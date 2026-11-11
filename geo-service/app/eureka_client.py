
import asyncio
import logging
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class EurekaClient:
    def __init__(self):
        self.base_url = settings.EUREKA_SERVER_URL.rstrip("/")
        self.app_name = (settings.EUREKA_APP_NAME or f"PARENTCONNECT-{settings.SERVICE_NAME}").upper()
        self.hostname = settings.EUREKA_INSTANCE_HOST
        self.port = settings.get_effective_port()
        self.instance_id = f"{self.hostname}:{self.port}"
        self.heartbeat_interval = settings.EUREKA_HEARTBEAT_INTERVAL

        self.client = httpx.AsyncClient(timeout=5.0)
        self.heartbeat_task = None
        self.registered = False

    @property
    def instance_url(self):
        return (
            f"{self.base_url}/apps/"
            f"{quote(self.app_name, safe='')}"
        )

    def get_instance_data(self):
        return {
            "instance": {
                "instanceId": self.instance_id,
                "hostName": self.hostname,
                "app": self.app_name,
                "ipAddr": self.hostname,
                "status": "UP",
                "port": {"$": self.port, "@enabled": "true"},
                "securePort": {"$": 443, "@enabled": "false"},
                "homePageUrl": f"http://{self.hostname}:{self.port}/",
                "statusPageUrl": f"http://{self.hostname}:{self.port}/health",
                "healthCheckUrl": f"http://{self.hostname}:{self.port}/health",
                "vipAddress": self.app_name.lower(),
                "dataCenterInfo": {
                    "@class": (
                        "com.netflix.appinfo.InstanceInfo"
                        "$DefaultDataCenterInfo"
                    ),
                    "name": "MyOwn"
                }
            }
        }

    async def register(self):
        try:
            response = await self.client.post(
                self.instance_url,
                json=self.get_instance_data(),
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            self.registered = True
            logger.info("Geo service registered successfully in Eureka.")
            return True

        except httpx.HTTPError as exc:
            self.registered = False
            logger.warning(f"Eureka registration failed: {exc}")
            return False

    async def heartbeat(self):
        url = f"{self.instance_url}/{quote(self.instance_id, safe='')}"

        try:
            response = await self.client.put(url)

            if response.status_code == 404:
                logger.warning("Geo instance missing in Eureka. Re-registering.")
                self.registered = False
                return await self.register()

            response.raise_for_status()
            logger.debug("Eureka heartbeat sent successfully.")
            return True

        except httpx.HTTPError as exc:
            logger.warning(f"Eureka heartbeat failed: {exc}")
            return False

    async def _heartbeat_loop(self):
        while True:
            await asyncio.sleep(self.heartbeat_interval)

            if not self.registered:
                await self.register()
            else:
                await self.heartbeat()

    async def start(self):
        if not settings.EUREKA_ENABLED:
            logger.info("Eureka registration is disabled.")
            return

        await self.register()

        self.heartbeat_task = asyncio.create_task(
            self._heartbeat_loop()
        )

    async def stop(self):
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            try:
                await self.heartbeat_task
            except asyncio.CancelledError:
                pass

        if self.registered:
            url = (
                f"{self.instance_url}/"
                f"{quote(self.instance_id, safe='')}"
            )
            try:
                response = await self.client.delete(url)
                response.raise_for_status()
                logger.info("Geo service deregistered from Eureka.")
            except httpx.HTTPError as exc:
                logger.warning(f"Eureka deregistration failed: {exc}")

        await self.client.aclose()


eureka_client = EurekaClient()
