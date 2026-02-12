from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from efda_scraper.config import Settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class EndpointSpec:
    method: str
    path: str
    params: dict[str, str]


def load_catalog(path: Path) -> dict[str, EndpointSpec]:
    if not path.exists():
        raise FileNotFoundError(
            f"Missing endpoint catalog: {path}. Copy endpoints.catalog.example.json to endpoints.catalog.json and edit paths."
        )
    raw = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, EndpointSpec] = {}
    for name, spec in raw.items():
        out[name] = EndpointSpec(
            method=str(spec["method"]).upper(),
            path=str(spec["path"]),
            params={str(k): str(v) for k, v in (spec.get("params") or {}).items()},
        )
    return out


def _load_storage_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(
            f"Missing storage state: {path}. Run `efda-scraper login` first."
        )
    return json.loads(path.read_text(encoding="utf-8"))


class PortalClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._state = _load_storage_state(settings.storage_state_path)
        self._client = httpx.Client(
            base_url=settings.base_url,
            timeout=settings.request_timeout_seconds,
        )

        for cookie in self._state.get("cookies", []):
            self._client.cookies.set(
                cookie["name"],
                cookie["value"],
                domain=cookie.get("domain"),
                path=cookie.get("path", "/"),
            )

    def close(self) -> None:
        self._client.close()

    def request(self, endpoint: EndpointSpec, *, fields: dict[str, Any] | None = None) -> dict[str, Any] | list[Any]:
        fields = fields or {}

        path = endpoint.path.format(**fields)
        params = {key: value.format(**fields) for key, value in endpoint.params.items()}

        logger.info("Requesting %s %s", endpoint.method, path)
        response = self._client.request(endpoint.method, path, params=params)
        response.raise_for_status()

        return response.json()
