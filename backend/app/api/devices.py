"""PATCH /api/devices/{device_id}: operate a device.

Every field of a ``DeviceUpdate`` applies to some device kinds only. A request that
sets a field the device's kind does not have, or a program the appliance does not
offer, is rejected with 422 before anything changes.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_sim
from app.engine import Simulation
from app.sim.state import ROOM_NAMES, Device, DeviceUpdate, SimState

router = APIRouter(tags=["devices"])

# Which DeviceUpdate field applies to which device kinds.
FIELD_KINDS: dict[str, frozenset[str]] = {
    "on": frozenset({"light", "plug", "appliance"}),
    "brightness": frozenset({"light"}),
    "position": frozenset({"shutter"}),
    "open": frozenset({"window"}),
    "target_c": frozenset({"thermostat"}),
    "program": frozenset({"appliance"}),
}
# Fields where an explicit null is meaningful (null = no program selected).
NULLABLE_FIELDS = frozenset({"program"})


class DeviceUpdateError(ValueError):
    """An update that does not fit the device it is meant for."""


def find_device(state: SimState, device_id: str) -> Device | None:
    """The device with this id, or None."""
    for device in state.devices:
        if device.id == device_id:
            return device
    return None


def validate_device_update(device: Device, update: DeviceUpdate) -> dict[str, object]:
    """The fields to apply, or ``DeviceUpdateError`` naming the first that does not fit."""
    changes: dict[str, object] = {}
    for field in update.model_fields_set:
        value = getattr(update, field)
        kinds = FIELD_KINDS[field]
        if device.kind not in kinds:
            raise DeviceUpdateError(
                f"Feld '{field}' gilt nicht für Geräte vom Typ '{device.kind}' ({device.id})"
            )
        if value is None and field not in NULLABLE_FIELDS:
            raise DeviceUpdateError(f"Feld '{field}' darf nicht null sein")
        if field == "program" and value is not None and value not in device.programs:
            raise DeviceUpdateError(f"Programm '{value}' gibt es für {device.name} nicht")
        changes[field] = value
    return changes


def _describe(device: Device, changes: dict[str, object]) -> str:
    """A German activity-log line for the applied changes."""
    parts: list[str] = []
    if "on" in changes:
        parts.append("eingeschaltet" if changes["on"] else "ausgeschaltet")
    if "brightness" in changes:
        parts.append(f"Helligkeit {changes['brightness']} %")
    if "position" in changes:
        parts.append(f"Position {changes['position']} % geschlossen")
    if "open" in changes:
        parts.append("geöffnet" if changes["open"] else "geschlossen")
    if "target_c" in changes:
        parts.append(f"Zieltemperatur {float(changes['target_c']):.1f} °C")
    if "program" in changes:
        program = changes["program"]
        parts.append(f"Programm {program}" if program else "kein Programm")
    room = ROOM_NAMES.get(device.room_id, device.room_id)
    detail = ", ".join(parts) if parts else "unverändert"
    return f"{room}: {device.name} {detail}"


def apply_device_update(device: Device, changes: dict[str, object]) -> None:
    """Write validated changes onto the device (the caller holds ``sim.lock``)."""
    for field, value in changes.items():
        setattr(device, field, value)


@router.patch("/api/devices/{device_id}", response_model=Device)
async def update_device(
    device_id: str, update: DeviceUpdate, sim: Simulation = Depends(get_sim)
) -> Device:
    async with sim.lock:
        device = find_device(sim.state, device_id)
        if device is None:
            raise HTTPException(status_code=404, detail=f"Gerät '{device_id}' nicht gefunden")
        try:
            changes = validate_device_update(device, update)
        except DeviceUpdateError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        apply_device_update(device, changes)
        sim.log(_describe(device, changes), "benutzer")
        result = device.model_copy(deep=True)
    await sim.broadcast()
    return result
