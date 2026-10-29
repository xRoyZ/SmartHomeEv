"""Persistence of the automations in the ``automations`` table.

Every statement is a constant SQL string with ``?`` placeholders. Callers hold
``sim.lock``; every write function here commits its own change.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import TYPE_CHECKING

from app.sim import automations as engine
from app.sim.state import Action, Automation, AutomationIn

if TYPE_CHECKING:
    from app.engine import Simulation

# Settings key that marks the defaults as written once (an empty table afterwards means
# the user deleted every automation, not a fresh database).
INITIALIZED_KEY = "automations_initialized"


def _row_to_automation(row: sqlite3.Row) -> Automation:
    return Automation.model_validate(
        {
            "id": row["id"],
            "name": row["name"],
            "enabled": bool(row["enabled"]),
            "condition": json.loads(row["condition"]),
            "action": json.loads(row["action"]),
            "last_fired_at": row["last_fired_at"],
        }
    )


def _condition_json(automation: AutomationIn) -> str:
    return automation.condition.model_dump_json()


def _action_json(action: Action) -> str:
    return action.model_dump_json(exclude_none=True)


def read_all(conn: sqlite3.Connection) -> list[Automation]:
    rows = conn.execute(
        "SELECT id, name, enabled, condition, action, last_fired_at FROM automations ORDER BY id"
    ).fetchall()
    return [_row_to_automation(row) for row in rows]


def count(conn: sqlite3.Connection) -> int:
    return int(conn.execute("SELECT COUNT(*) FROM automations").fetchone()[0])


def _insert_row(conn: sqlite3.Connection, automation: AutomationIn) -> int:
    cursor = conn.execute(
        "INSERT INTO automations (name, enabled, condition, action, last_fired_at) "
        "VALUES (?, ?, ?, ?, NULL)",
        (
            automation.name,
            int(automation.enabled),
            _condition_json(automation),
            _action_json(automation.action),
        ),
    )
    return int(cursor.lastrowid)


def insert(conn: sqlite3.Connection, automation: AutomationIn) -> Automation:
    """Store a new automation and return it with its id."""
    new_id = _insert_row(conn, automation)
    conn.commit()
    return Automation(id=new_id, last_fired_at=None, **automation.model_dump())


def update(conn: sqlite3.Connection, automation: Automation) -> None:
    """Overwrite the stored row of ``automation`` (matched by id)."""
    conn.execute(
        "UPDATE automations SET name = ?, enabled = ?, condition = ?, action = ?, "
        "last_fired_at = ? WHERE id = ?",
        (
            automation.name,
            int(automation.enabled),
            _condition_json(automation),
            _action_json(automation.action),
            automation.last_fired_at.isoformat() if automation.last_fired_at else None,
            automation.id,
        ),
    )
    conn.commit()


def delete(conn: sqlite3.Connection, automation_id: int) -> None:
    conn.execute("DELETE FROM automations WHERE id = ?", (automation_id,))
    conn.commit()


def save_last_fired(conn: sqlite3.Connection, automation_id: int, when: datetime | None) -> None:
    conn.execute(
        "UPDATE automations SET last_fired_at = ? WHERE id = ?",
        (when.isoformat() if when else None, automation_id),
    )
    conn.commit()


def _replace_with_defaults(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM automations")
    # Restart the ids at 1 so a reset reproduces the state of a fresh start.
    conn.execute("DELETE FROM sqlite_sequence WHERE name = ?", ("automations",))
    for automation in engine.default_automations():
        _insert_row(conn, automation)
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (INITIALIZED_KEY, "1"),
    )
    conn.commit()


def _is_initialized(conn: sqlite3.Connection) -> bool:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (INITIALIZED_KEY,)).fetchone()
    return row is not None


def load(sim: Simulation) -> None:
    """Load the stored automations into ``sim.state.automations`` at startup.

    A database that never held automations gets the defaults written first.
    """
    if not _is_initialized(sim.conn):
        _replace_with_defaults(sim.conn)
    sim.state.automations = read_all(sim.conn)
    engine.prime(sim)


def on_reset(sim: Simulation) -> None:
    """Replace every stored automation with the defaults and load them into the state."""
    _replace_with_defaults(sim.conn)
    sim.state.automations = read_all(sim.conn)
    engine.prime(sim)
