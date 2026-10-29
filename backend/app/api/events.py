"""POST /api/events: trigger an event."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import get_sim
from app.engine import Simulation
from app.sim import events
from app.sim.state import ActiveEvent, EventTrigger

router = APIRouter(tags=["events"])


@router.post("/api/events", response_model=ActiveEvent, status_code=201)
async def trigger_event(body: EventTrigger, sim: Simulation = Depends(get_sim)) -> ActiveEvent:
    """Start the event; an unknown type is rejected with 422 by the body model."""
    async with sim.lock:
        event = events.trigger(sim, body.type)
        result = event.model_copy(deep=True)
    await sim.broadcast()
    return result
