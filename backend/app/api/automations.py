"""CRUD of the automations.

Implemented by the ticket "Implement automations engine, CRUD and persistence".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response

from app.deps import get_sim
from app.engine import Simulation
from app.sim.state import Automation, AutomationIn, EnabledUpdate

router = APIRouter(tags=["automations"])

MAX_AUTOMATIONS = 100
_NOT_YET = "Automations are not implemented yet"


@router.get("/api/automations", response_model=list[Automation])
async def list_automations(sim: Simulation = Depends(get_sim)) -> list[Automation]:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.post("/api/automations", response_model=Automation, status_code=201)
async def create_automation(body: AutomationIn, sim: Simulation = Depends(get_sim)) -> Automation:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.put("/api/automations/{id}", response_model=Automation)
async def update_automation(
    id: int, body: AutomationIn, sim: Simulation = Depends(get_sim)
) -> Automation:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.patch("/api/automations/{id}/enabled", response_model=Automation)
async def set_automation_enabled(
    id: int, body: EnabledUpdate, sim: Simulation = Depends(get_sim)
) -> Automation:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.delete("/api/automations/{id}", status_code=204, response_class=Response)
async def delete_automation(id: int, sim: Simulation = Depends(get_sim)) -> Response:
    raise HTTPException(status_code=501, detail=_NOT_YET)
