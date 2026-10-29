"""Alerts and their thresholds."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_sim
from app.engine import Simulation
from app.sim import alerts as alerts_sim
from app.sim.state import Alert, Thresholds
from app.store import thresholds as thresholds_store

router = APIRouter(tags=["alerts"])


@router.get("/api/alerts", response_model=list[Alert])
async def list_alerts(sim: Simulation = Depends(get_sim)) -> list[Alert]:
    return list(sim.state.alerts)


@router.post("/api/alerts/{alert_id}/acknowledge", response_model=Alert)
async def acknowledge_alert(alert_id: str, sim: Simulation = Depends(get_sim)) -> Alert:
    async with sim.lock:
        alert = next((a for a in sim.state.alerts if a.id == alert_id), None)
        if alert is None:
            raise HTTPException(status_code=404, detail="Alert not found")
        if not alert.acknowledged:
            alert.acknowledged = True
            sim.log(f"Alarm bestätigt: {alert.message}", "benutzer")
        result = alert.model_copy()
    await sim.broadcast()
    return result


@router.get("/api/thresholds", response_model=Thresholds)
async def get_thresholds(sim: Simulation = Depends(get_sim)) -> Thresholds:
    return sim.state.thresholds


@router.put("/api/thresholds", response_model=Thresholds)
async def put_thresholds(body: Thresholds, sim: Simulation = Depends(get_sim)) -> Thresholds:
    async with sim.lock:
        # Persist first: a failed write leaves the running state untouched.
        thresholds_store.save(sim.conn, body)
        sim.state.thresholds = body.model_copy()
        # Takes effect immediately, also while the simulation is paused.
        alerts_sim.evaluate(sim.state)
        sim.log("Grenzwerte geändert", "benutzer")
        result = sim.state.thresholds.model_copy()
    await sim.broadcast()
    return result
