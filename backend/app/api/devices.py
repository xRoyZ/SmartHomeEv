"""PATCH /api/devices/{device_id}: operate a device.

Implemented by the ticket "Implement the device control endpoint".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_sim
from app.engine import Simulation
from app.sim.state import Device, DeviceUpdate

router = APIRouter(tags=["devices"])


@router.patch("/api/devices/{device_id}", response_model=Device)
async def update_device(
    device_id: str, update: DeviceUpdate, sim: Simulation = Depends(get_sim)
) -> Device:
    raise HTTPException(status_code=501, detail="Device control is not implemented yet")
