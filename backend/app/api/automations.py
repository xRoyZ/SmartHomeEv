"""CRUD of the automations.

Every mutation validates the rule against the current house (the action's device must
exist and accept the fields it sets, as on the device endpoint), changes the state and
the database inside ``sim.lock`` and then broadcasts the new state.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response

from app.deps import get_sim
from app.engine import Simulation
from app.sim import automations as engine
from app.sim.state import Automation, AutomationIn, EnabledUpdate
from app.store import automations as store

router = APIRouter(tags=["automations"])

MAX_AUTOMATIONS = 100


def _validate(sim: Simulation, body: AutomationIn) -> None:
    """422 when the rule cannot work in this house.

    Room ids and the window id of a contact condition are checked by the model itself.
    """
    problem = engine.validate_action(sim.state, body.action)
    if problem is not None:
        raise HTTPException(status_code=422, detail=f"action: {problem}")


def _find(sim: Simulation, automation_id: int) -> Automation:
    for automation in sim.state.automations:
        if automation.id == automation_id:
            return automation
    raise HTTPException(status_code=404, detail=f"Automation {automation_id} not found")


@router.get("/api/automations", response_model=list[Automation])
async def list_automations(sim: Simulation = Depends(get_sim)) -> list[Automation]:
    return sim.state.automations


@router.post("/api/automations", response_model=Automation, status_code=201)
async def create_automation(body: AutomationIn, sim: Simulation = Depends(get_sim)) -> Automation:
    async with sim.lock:
        _validate(sim, body)
        if store.count(sim.conn) >= MAX_AUTOMATIONS:
            raise HTTPException(
                status_code=409,
                detail=f"At most {MAX_AUTOMATIONS} automations can be stored",
            )
        created = store.insert(sim.conn, body)
        sim.state.automations.append(created)
        engine.forget(sim, created.id)
        sim.log(f"Automation „{created.name}“ angelegt", "benutzer")
    await sim.broadcast()
    return created


@router.put("/api/automations/{id}", response_model=Automation)
async def update_automation(
    id: int, body: AutomationIn, sim: Simulation = Depends(get_sim)
) -> Automation:
    async with sim.lock:
        automation = _find(sim, id)
        _validate(sim, body)
        updated = Automation(
            id=automation.id, last_fired_at=automation.last_fired_at, **body.model_dump()
        )
        store.update(sim.conn, updated)
        index = sim.state.automations.index(automation)
        sim.state.automations[index] = updated
        engine.forget(sim, updated.id)
        sim.log(f"Automation „{updated.name}“ geändert", "benutzer")
    await sim.broadcast()
    return updated


@router.patch("/api/automations/{id}/enabled", response_model=Automation)
async def set_automation_enabled(
    id: int, body: EnabledUpdate, sim: Simulation = Depends(get_sim)
) -> Automation:
    async with sim.lock:
        automation = _find(sim, id)
        changed = automation.model_copy(update={"enabled": body.enabled})
        store.update(sim.conn, changed)
        automation.enabled = body.enabled
        engine.forget(sim, automation.id)
        verb = "aktiviert" if body.enabled else "deaktiviert"
        sim.log(f"Automation „{automation.name}“ {verb}", "benutzer")
    await sim.broadcast()
    return automation


@router.delete("/api/automations/{id}", status_code=204, response_class=Response)
async def delete_automation(id: int, sim: Simulation = Depends(get_sim)) -> Response:
    async with sim.lock:
        automation = _find(sim, id)
        store.delete(sim.conn, automation.id)
        sim.state.automations.remove(automation)
        engine.forget(sim, automation.id)
        sim.log(f"Automation „{automation.name}“ gelöscht", "benutzer")
    await sim.broadcast()
    return Response(status_code=204)
