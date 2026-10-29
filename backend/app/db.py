"""SQLite access: one connection per process, schema created at startup.

Every statement in this product is a constant SQL string with ``?`` placeholders;
values are always passed as parameters, never formatted into the SQL text.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "smarthome.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS thresholds (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT
);
CREATE TABLE IF NOT EXISTS automations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    enabled INTEGER,
    condition TEXT,
    action TEXT,
    last_fired_at TEXT
);
CREATE TABLE IF NOT EXISTS history (
    sim_time TEXT,
    series_key TEXT,
    metric TEXT,
    value REAL
);
CREATE INDEX IF NOT EXISTS idx_history_metric_time ON history (metric, sim_time);
"""


def db_path_from_env() -> str:
    """SMARTHOME_DB_PATH, or ``data/smarthome.db`` inside ``backend/``."""
    configured = os.environ.get("SMARTHOME_DB_PATH", "").strip()
    return configured or str(DEFAULT_DB_PATH)


def connect(path: str) -> sqlite3.Connection:
    """Open (and create, with its folder) the SQLite database at ``path``.

    ``:memory:`` opens a private in-memory database. The connection may be used from
    the event loop and from FastAPI's worker threads; callers serialize writes through
    ``sim.lock`` and commit their own changes.
    """
    if path != ":memory:" and not path.startswith("file:"):
        folder = Path(path).expanduser().resolve().parent
        try:
            folder.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise RuntimeError(
                f"SMARTHOME_DB_PATH: cannot create the folder {folder} for the database: {exc}"
            ) from exc
    try:
        conn = sqlite3.connect(path, check_same_thread=False)
    except sqlite3.Error as exc:
        raise RuntimeError(f"SMARTHOME_DB_PATH: cannot open the database {path}: {exc}") from exc
    conn.row_factory = sqlite3.Row
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    """Create the four tables and the history index if they do not exist yet."""
    conn.executescript(SCHEMA)
    conn.commit()
