"""Alerts and their thresholds.

Implemented by the ticket "Implement alerts, acknowledgement and thresholds".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_sim
from app.engine import Simulation
from app.sim.state import Alert, Thresholds

router = APIRouter(tags=["alerts"])

_NOT_YET = "Alerts are not implemented yet"


@router.get("/api/alerts", response_model=list[Alert])
async def list_alerts(sim: Simulation = Depends(get_sim)) -> list[Alert]:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.post("/api/alerts/{alert_id}/acknowledge", response_model=Alert)
async def acknowledge_alert(alert_id: str, sim: Simulation = Depends(get_sim)) -> Alert:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.get("/api/thresholds", response_model=Thresholds)
async def get_thresholds(sim: Simulation = Depends(get_sim)) -> Thresholds:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.put("/api/thresholds", response_model=Thresholds)
async def put_thresholds(body: Thresholds, sim: Simulation = Depends(get_sim)) -> Thresholds:
    raise HTTPException(status_code=501, detail=_NOT_YET)
