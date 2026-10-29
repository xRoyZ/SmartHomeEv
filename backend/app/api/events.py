"""POST /api/events: trigger an event.

Implemented by the ticket "Implement triggerable events".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_sim
from app.engine import Simulation
from app.sim.state import ActiveEvent, EventTrigger

router = APIRouter(tags=["events"])


@router.post("/api/events", response_model=ActiveEvent, status_code=201)
async def trigger_event(body: EventTrigger, sim: Simulation = Depends(get_sim)) -> ActiveEvent:
    raise HTTPException(status_code=501, detail="Events are not implemented yet")
