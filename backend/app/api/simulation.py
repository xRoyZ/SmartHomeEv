"""Simulation control: clock, speed, settings and reset.

Implemented by the ticket "Implement simulation control, settings persistence and reset".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_sim
from app.engine import Simulation
from app.sim.state import Clock, Settings, SettingsUpdate, SimState, SpeedUpdate

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

_NOT_YET = "Simulation control is not implemented yet"


@router.post("/pause", response_model=Clock)
async def pause(sim: Simulation = Depends(get_sim)) -> Clock:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.post("/resume", response_model=Clock)
async def resume(sim: Simulation = Depends(get_sim)) -> Clock:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.put("/speed", response_model=Clock)
async def set_speed(body: SpeedUpdate, sim: Simulation = Depends(get_sim)) -> Clock:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.get("/settings", response_model=Settings)
async def get_settings(sim: Simulation = Depends(get_sim)) -> Settings:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.put("/settings", response_model=Settings)
async def update_settings(body: SettingsUpdate, sim: Simulation = Depends(get_sim)) -> Settings:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.post("/reset", response_model=SimState)
async def reset(sim: Simulation = Depends(get_sim)) -> SimState:
    raise HTTPException(status_code=501, detail=_NOT_YET)
