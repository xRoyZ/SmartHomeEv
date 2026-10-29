"""Simulation control: clock, speed, settings and reset.

Every mutation runs inside ``sim.lock`` and is followed by a broadcast, so every
connected client sees the new clock/settings at once.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import get_sim
from app.engine import Simulation
from app.sim.state import Clock, Settings, SettingsUpdate, SimState, SpeedUpdate
from app.store import settings as settings_store

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

# Settings that change the running simulation at once.
IMMEDIATE_FIELDS = ("weather_mode", "season", "behaviour", "speed")
# Settings that only take effect when the simulation is reset.
ON_RESET_FIELDS = ("seed", "start_time", "adults", "children")


@router.post("/pause", response_model=Clock)
async def pause(sim: Simulation = Depends(get_sim)) -> Clock:
    async with sim.lock:
        if not sim.state.clock.paused:
            sim.state.clock.paused = True
            sim.log("Simulation pausiert", "system")
        clock = sim.state.clock.model_copy()
    await sim.broadcast()
    return clock


@router.post("/resume", response_model=Clock)
async def resume(sim: Simulation = Depends(get_sim)) -> Clock:
    async with sim.lock:
        if sim.state.clock.paused:
            sim.state.clock.paused = False
            sim.log("Simulation fortgesetzt", "system")
        clock = sim.state.clock.model_copy()
    await sim.broadcast()
    return clock


@router.put("/speed", response_model=Clock)
async def set_speed(body: SpeedUpdate, sim: Simulation = Depends(get_sim)) -> Clock:
    async with sim.lock:
        sim.state.clock.speed = body.speed
        if sim.state.settings.speed != body.speed:
            sim.state.settings.speed = body.speed
            settings_store.save(sim.conn, sim.state.settings)
            sim.log(f"Geschwindigkeit auf {body.speed}x gesetzt", "system")
        clock = sim.state.clock.model_copy()
    await sim.broadcast()
    return clock


@router.get("/settings", response_model=Settings)
async def get_settings(sim: Simulation = Depends(get_sim)) -> Settings:
    return sim.state.settings


@router.put("/settings", response_model=Settings)
async def update_settings(body: SettingsUpdate, sim: Simulation = Depends(get_sim)) -> Settings:
    # An explicit null means "leave unchanged": every Settings field is required.
    changes = {
        key: value
        for key, value in body.model_dump(exclude_unset=True).items()
        if value is not None
    }
    async with sim.lock:
        merged = sim.state.settings.model_copy(update=changes)
        # Re-validate the merged object so the stored settings are always a valid Settings.
        new_settings = Settings.model_validate(merged.model_dump())
        changed = [
            key for key in changes if getattr(sim.state.settings, key) != getattr(new_settings, key)
        ]
        sim.state.settings = new_settings
        sim.state.clock.speed = new_settings.speed
        settings_store.save(sim.conn, new_settings)
        if changed:
            immediate = [key for key in changed if key in IMMEDIATE_FIELDS]
            pending = [key for key in changed if key in ON_RESET_FIELDS]
            parts = []
            if immediate:
                parts.append(
                    "sofort wirksam: "
                    + ", ".join(f"{k}={getattr(new_settings, k)}" for k in immediate)
                )
            if pending:
                parts.append("wirksam nach Zurücksetzen: " + ", ".join(pending))
            sim.log("Einstellungen geändert (" + "; ".join(parts) + ")", "system")
        result = new_settings.model_copy()
    await sim.broadcast()
    return result


@router.post("/reset", response_model=SimState)
async def reset(sim: Simulation = Depends(get_sim)) -> SimState:
    async with sim.lock:
        sim.reset()
        sim.log("Simulation zurückgesetzt", "system")
        state = sim.state.model_copy(deep=True)
    await sim.broadcast()
    return state
