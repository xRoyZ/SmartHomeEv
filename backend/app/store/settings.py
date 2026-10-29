"""Persistence of the simulation settings.

The whole ``Settings`` object is stored as one JSON document under a single key of the
``settings`` table. Every statement is a constant SQL string with ``?`` placeholders.
"""

from __future__ import annotations

import logging
import sqlite3

from pydantic import ValidationError

from app.sim.state import Settings

logger = logging.getLogger(__name__)

SETTINGS_KEY = "simulation"

_SELECT = "SELECT value FROM settings WHERE key = ?"
_UPSERT = (
    "INSERT INTO settings (key, value) VALUES (?, ?) "
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
)


def load(conn: sqlite3.Connection) -> Settings | None:
    """The stored settings, or None when none were saved yet (or they are unreadable)."""
    row = conn.execute(_SELECT, (SETTINGS_KEY,)).fetchone()
    if row is None or row[0] is None:
        return None
    try:
        return Settings.model_validate_json(row[0])
    except ValidationError:
        logger.warning("stored simulation settings are invalid; using the defaults")
        return None


def save(conn: sqlite3.Connection, settings: Settings) -> None:
    """Store ``settings`` so they survive a restart (the caller holds ``sim.lock``)."""
    conn.execute(_UPSERT, (SETTINGS_KEY, settings.model_dump_json()))
    conn.commit()
