"""History of sensor and power values, sampled from the running simulation.

``sample`` stores one value per series at every 5-simulated-minute boundary the clock
has crossed, ``query`` reads a time window back as a ``HistoryResponse``. Every
statement is a constant SQL string; values are always bound as ``?`` parameters.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from app.sim.state import (
    ROOM_IDS,
    ROOM_NAMES,
    HistoryMetric,
    HistoryPoint,
    HistoryResponse,
    HistorySeries,
    RoomId,
)

if TYPE_CHECKING:
    from app.engine import Simulation

logger = logging.getLogger(__name__)

SAMPLE_INTERVAL = timedelta(minutes=5)
RETENTION = timedelta(days=7)
# A single call never back-fills more than this many boundaries (e.g. after a restart
# whose clock starts long after the last stored sample).
MAX_BACKFILL_SAMPLES = 12

OUTDOOR_KEY = "aussen"
CONSUMPTION_KEY = "verbrauch"
SOLAR_KEY = "solar"
LABELS: dict[str, str] = {
    OUTDOOR_KEY: "Außen",
    CONSUMPTION_KEY: "Verbrauch",
    SOLAR_KEY: "Solarertrag",
}

_TIME_FORMAT = "%Y-%m-%dT%H:%M:%S"

_SQL_LAST_SAMPLE = "SELECT MAX(sim_time) FROM history WHERE metric = ? AND sim_time <= ?"
_SQL_DELETE_AT = "DELETE FROM history WHERE sim_time = ?"
_SQL_INSERT = "INSERT INTO history (sim_time, series_key, metric, value) VALUES (?, ?, ?, ?)"
_SQL_PRUNE = "DELETE FROM history WHERE sim_time < ?"
_SQL_DELETE_ALL = "DELETE FROM history"
_SQL_SELECT = (
    "SELECT sim_time, series_key, value FROM history "
    "WHERE metric = ? AND sim_time >= ? AND sim_time <= ? ORDER BY sim_time"
)
_SQL_SELECT_KEYS = (
    "SELECT sim_time, series_key, value FROM history "
    "WHERE metric = ? AND sim_time >= ? AND sim_time <= ? AND series_key IN (?, ?) "
    "ORDER BY sim_time"
)


def _fmt(t: datetime) -> str:
    return t.strftime(_TIME_FORMAT)


def _floor_to_interval(t: datetime) -> datetime:
    """``t`` rounded down to the previous 5-minute boundary."""
    minute = t.minute - t.minute % 5
    return t.replace(minute=minute, second=0, microsecond=0)


def _rows_for(sim: Simulation) -> list[tuple[str, str, float]]:
    """(series_key, metric, value) of every series at the current state."""
    state = sim.state
    rows: list[tuple[str, str, float]] = []
    for room in state.rooms:
        rows.append((room.id, "temperature", float(room.temperature_c)))
        rows.append((room.id, "humidity", float(room.humidity_pct)))
        rows.append((room.id, "co2", float(room.co2_ppm)))
    rows.append((OUTDOOR_KEY, "temperature", float(state.outdoor.temperature_c)))
    rows.append((CONSUMPTION_KEY, "power", float(state.solar.consumption_w)))
    rows.append((SOLAR_KEY, "power", float(state.solar.production_w)))
    return rows


def sample(sim: Simulation) -> None:
    """Store the current values once per crossed 5-minute boundary; prune > 7 days.

    Called once per loop tick. Boundaries already sampled are skipped, so a tick
    that crosses no boundary writes nothing.
    """
    now = sim.state.clock.sim_time
    latest = _floor_to_interval(now)
    conn = sim.conn
    try:
        found = conn.execute(_SQL_LAST_SAMPLE, ("temperature", _fmt(now))).fetchone()[0]
        if found is None:
            first = latest
        else:
            first = datetime.fromisoformat(found) + SAMPLE_INTERVAL
            first = max(first, latest - SAMPLE_INTERVAL * (MAX_BACKFILL_SAMPLES - 1))
        if first > latest:
            return
        values = _rows_for(sim)
        boundary = first
        while boundary <= latest:
            stamp = _fmt(boundary)
            # A stale row at this time (from an earlier run's timeline) is replaced.
            conn.execute(_SQL_DELETE_AT, (stamp,))
            conn.executemany(
                _SQL_INSERT, [(stamp, key, metric, value) for key, metric, value in values]
            )
            boundary += SAMPLE_INTERVAL
        conn.execute(_SQL_PRUNE, (_fmt(now - RETENTION),))
        conn.commit()
    except sqlite3.Error:
        conn.rollback()
        logger.exception("storing a history sample failed")


def on_reset(sim: Simulation) -> None:
    """Forget the recorded history after a simulation reset."""
    try:
        sim.conn.execute(_SQL_DELETE_ALL)
        sim.conn.commit()
    except sqlite3.Error:
        sim.conn.rollback()
        logger.exception("clearing the history failed")
        raise


def _expected_series(metric: HistoryMetric, room_id: RoomId | None) -> list[str]:
    if metric == "power":
        return [CONSUMPTION_KEY, SOLAR_KEY]
    rooms: list[str] = [room_id] if room_id is not None else list(ROOM_IDS)
    if metric == "temperature":
        rooms.append(OUTDOOR_KEY)
    return rooms


def query(
    conn: sqlite3.Connection,
    metric: HistoryMetric,
    room_id: RoomId | None,
    hours: int,
    now: datetime,
) -> HistoryResponse:
    """The series of ``metric`` over the last ``hours`` simulated hours up to ``now``.

    temperature: every room (or only ``room_id``) plus ``aussen``; humidity/co2: every
    room (or only ``room_id``); power: ``verbrauch`` and ``solar`` (``room_id`` ignored).
    Every expected series is present, possibly with no points yet.
    """
    from_time = now - timedelta(hours=hours)
    keys = _expected_series(metric, room_id)
    window = (metric, from_time.isoformat(), now.isoformat())
    if metric != "power" and room_id is not None:
        second = OUTDOOR_KEY if metric == "temperature" else room_id
        rows = conn.execute(_SQL_SELECT_KEYS, (*window, room_id, second)).fetchall()
    else:
        rows = conn.execute(_SQL_SELECT, window).fetchall()

    points: dict[str, list[HistoryPoint]] = {key: [] for key in keys}
    for sim_time, key, value in rows:
        if key in points:
            points[key].append(HistoryPoint(t=datetime.fromisoformat(sim_time), v=value))
    series = [
        HistorySeries(key=key, label=ROOM_NAMES.get(key) or LABELS[key], points=points[key])
        for key in keys
    ]
    return HistoryResponse(metric=metric, from_time=from_time, to_time=now, series=series)
