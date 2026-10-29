"""Shared fixtures: the app against a temporary database, and a standalone simulation."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import db
from app.engine import Simulation
from app.main import app
from app.sim.state import Settings


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    """The app with its real lifespan (schema, simulation, loop) on a temporary database."""
    monkeypatch.setenv("SMARTHOME_DB_PATH", str(tmp_path / "smarthome-test.db"))
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def sim() -> Iterator[Simulation]:
    """A simulation with default settings on an in-memory database; no loop is running."""
    conn = db.connect(":memory:")
    db.init_schema(conn)
    try:
        yield Simulation(Settings(), conn)
    finally:
        conn.close()
