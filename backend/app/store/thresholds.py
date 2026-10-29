"""Persistence of the alert thresholds (table ``thresholds``, single row ``id = 1``).

Only constant SQL with ``?`` placeholders; the thresholds are stored as JSON text.
"""

from __future__ import annotations

import logging
import sqlite3
from typing import TYPE_CHECKING

from pydantic import ValidationError

from app.sim.state import Thresholds

if TYPE_CHECKING:
    from app.engine import Simulation

logger = logging.getLogger(__name__)

_SELECT = "SELECT data FROM thresholds WHERE id = ?"
_UPSERT = (
    "INSERT INTO thresholds (id, data) VALUES (?, ?) "
    "ON CONFLICT(id) DO UPDATE SET data = excluded.data"
)
_ROW_ID = 1


def read(conn: sqlite3.Connection) -> Thresholds | None:
    """The stored thresholds, or None when none (or no valid ones) are stored."""
    row = conn.execute(_SELECT, (_ROW_ID,)).fetchone()
    if row is None or row[0] is None:
        return None
    try:
        return Thresholds.model_validate_json(row[0])
    except ValidationError:
        logger.warning("stored thresholds are invalid; using the defaults")
        return None


def save(conn: sqlite3.Connection, thresholds: Thresholds) -> None:
    """Store ``thresholds`` so they survive a restart."""
    conn.execute(_UPSERT, (_ROW_ID, thresholds.model_dump_json()))
    conn.commit()


def load(sim: Simulation) -> None:
    """Load the stored thresholds into ``sim.state.thresholds`` at startup."""
    stored = read(sim.conn)
    if stored is not None:
        sim.state.thresholds = stored


def on_reset(sim: Simulation) -> None:
    """After a simulation reset: thresholds return to the defaults, in state and storage."""
    defaults = Thresholds()
    sim.state.thresholds = defaults
    save(sim.conn, defaults)
