"""GET /api/history: recorded values of the last hours.

Implemented by the ticket "Implement history sampling and the history endpoint".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

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
    raise HTTPException(status_code=501, detail="History is not implemented yet")
