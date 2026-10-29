"""GET /api/history: recorded values of the last hours.

``metric`` and ``room_id`` are validated against their literal types and ``hours``
against 1..168; anything else answers 422.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app import history
from app.deps import get_sim
from app.engine import Simulation
from app.sim.state import HistoryMetric, HistoryResponse, RoomId

router = APIRouter(tags=["history"])


@router.get("/api/history", response_model=HistoryResponse)
async def get_history(
    metric: HistoryMetric,
    room_id: RoomId | None = None,
    hours: int = Query(default=24, ge=1, le=168),
    sim: Simulation = Depends(get_sim),
) -> HistoryResponse:
    """Recorded values of ``metric`` over the last ``hours`` simulated hours."""
    async with sim.lock:
        return history.query(sim.conn, metric, room_id, hours, sim.state.clock.sim_time)
