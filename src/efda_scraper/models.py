from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class MedicineImportRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    source_record_id: str = Field(description="Stable id from portal record")
    permit_number: str | None = None
    importer_name: str | None = None
    product_name: str | None = None
    quantity: float | None = None
    quantity_unit: str | None = None
    origin_country: str | None = None
    status: str | None = None
    imported_at: datetime | None = None
    updated_at: datetime | None = None
    raw: dict[str, Any]


def stable_record_id(payload: dict[str, Any]) -> str:
    for key in ("id", "import_id", "permit_id", "reference_no", "referenceNumber"):
        value = payload.get(key)
        if value is not None:
            return str(value)
    serial = repr(sorted(payload.items())).encode("utf-8")
    return sha256(serial).hexdigest()


def now_utc() -> datetime:
    return datetime.now(UTC)
