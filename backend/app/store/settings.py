"""Persistence of the simulation settings.

Implemented by the ticket "Implement simulation control, settings persistence and
reset"; until then nothing is stored and the defaults apply at startup.
"""

from __future__ import annotations

import sqlite3

from app.sim.state import Settings


def load(conn: sqlite3.Connection) -> Settings | None:
    """The stored settings, or None when none were saved yet."""
    return None


def save(conn: sqlite3.Connection, settings: Settings) -> None:
    """Store ``settings`` so they survive a restart."""
