"""History of sensor and power values, sampled from the running simulation.

Implemented by the history ticket; until then sampling stores nothing and a query
returns no series.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from app.sim.state import HistoryMetric, HistoryResponse, RoomId

if TYPE_CHECKING:
    from app.engine import Simulation


def sample(sim: Simulation) -> None:
    """Store the current values of every series (called once per loop tick)."""


def on_reset(sim: Simulation) -> None:
    """Forget the recorded history after a simulation reset."""


def query(
    conn: sqlite3.Connection,
    metric: HistoryMetric,
    room_id: RoomId | None,
    hours: int,
    now: datetime,
) -> HistoryResponse:
    """The series of ``metric`` over the last ``hours`` simulated hours up to ``now``."""
    return HistoryResponse(
        metric=metric, from_time=now - timedelta(hours=hours), to_time=now, series=[]
    )
