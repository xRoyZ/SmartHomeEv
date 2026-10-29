"""Simulation control: pause/resume, speed, settings persistence and reset."""

from __future__ import annotations

import time
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app import db
from app.engine import TICK_REAL_S, Simulation, tick
from app.main import app
from app.sim.state import Settings
from app.store import settings as settings_store


def _sim_time(client: TestClient) -> datetime:
    return datetime.fromisoformat(client.get("/api/state").json()["clock"]["sim_time"])


# --------------------------------------------------------------------------- clock


def test_pause_freezes_the_clock_and_resume_continues(client: TestClient) -> None:
    response = client.post("/api/simulation/pause")
    assert response.status_code == 200
    assert response.json()["paused"] is True

    frozen = _sim_time(client)
    time.sleep(3 * TICK_REAL_S)
    assert _sim_time(client) == frozen
    assert client.get("/api/state").json()["clock"]["paused"] is True

    response = client.post("/api/simulation/resume")
    assert response.status_code == 200
    assert response.json()["paused"] is False
    time.sleep(3 * TICK_REAL_S)
    assert _sim_time(client) > frozen


def test_pause_stops_advance_in_loop_ticks(sim: Simulation) -> None:
    sim.state.clock.paused = True
    before = sim.state.clock.sim_time
    for _ in range(10):
        tick(sim)
    assert sim.state.clock.sim_time == before

    sim.state.clock.paused = False
    tick(sim)
    assert sim.state.clock.sim_time > before


def test_pause_is_broadcast_to_websocket_clients(client: TestClient) -> None:
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "state"
        client.post("/api/simulation/pause")
        # Messages after the pause carry paused=True (loop ticks keep broadcasting).
        for _ in range(20):
            message = ws.receive_json()
            if message["type"] == "state" and message["state"]["clock"]["paused"]:
                break
        else:
            raise AssertionError("no paused state was broadcast")


def test_speed_1440_makes_one_real_minute_a_simulated_day(sim: Simulation) -> None:
    sim.state.clock.speed = 1440
    start = sim.state.clock.sim_time
    ticks_per_real_minute = int(60 / TICK_REAL_S)
    for _ in range(ticks_per_real_minute):
        tick(sim)
    elapsed = sim.state.clock.sim_time - start
    assert abs(elapsed - timedelta(hours=24)) < timedelta(minutes=1)


def test_put_speed_sets_clock_and_settings(client: TestClient) -> None:
    response = client.put("/api/simulation/speed", json={"speed": 1440})
    assert response.status_code == 200
    assert response.json()["speed"] == 1440
    state = client.get("/api/state").json()
    assert state["clock"]["speed"] == 1440
    assert state["settings"]["speed"] == 1440
    assert client.get("/api/simulation/settings").json()["speed"] == 1440

    # The running loop now advances 720 simulated seconds per 0.5 s tick.
    client.post("/api/simulation/resume")
    before = _sim_time(client)
    time.sleep(4 * TICK_REAL_S)
    assert _sim_time(client) - before >= timedelta(minutes=12)


def test_every_contract_speed_is_accepted(client: TestClient) -> None:
    for speed in (1, 60, 360, 1440):
        response = client.put("/api/simulation/speed", json={"speed": speed})
        assert response.status_code == 200
        assert response.json()["speed"] == speed


def test_invalid_speed_is_rejected_without_change(client: TestClient) -> None:
    before = client.get("/api/state").json()
    for body in ({"speed": 2}, {"speed": "fast"}, {"speed": -60}, {}, {"speed": 60, "x": 1}):
        assert client.put("/api/simulation/speed", json=body).status_code == 422
    assert client.put("/api/simulation/settings", json={"speed": 100}).status_code == 422
    after = client.get("/api/state").json()
    assert after["clock"]["speed"] == before["clock"]["speed"]
    assert after["settings"] == before["settings"]


# --------------------------------------------------------------------------- settings


def test_get_settings_returns_defaults(client: TestClient) -> None:
    response = client.get("/api/simulation/settings")
    assert response.status_code == 200
    assert response.json() == Settings().model_dump(mode="json")


def test_put_settings_applies_immediate_fields_and_logs(client: TestClient) -> None:
    body = {"weather_mode": "regen", "season": "sommer", "behaviour": "urlaub", "speed": 360}
    response = client.put("/api/simulation/settings", json=body)
    assert response.status_code == 200
    for key, value in body.items():
        assert response.json()[key] == value

    state = client.get("/api/state").json()
    for key, value in body.items():
        assert state["settings"][key] == value
    assert state["clock"]["speed"] == 360
    assert any(
        entry["source"] == "system" and "Einstellungen" in entry["message"]
        for entry in state["activity"]
    )


def test_put_settings_keeps_reset_fields_until_reset(client: TestClient) -> None:
    client.post("/api/simulation/pause")
    start = datetime(2026, 7, 1, 12, 0, 0)
    response = client.put(
        "/api/simulation/settings",
        json={"seed": 7, "start_time": start.isoformat(), "adults": 1, "children": 0},
    )
    assert response.status_code == 200
    settings = response.json()
    assert settings["seed"] == 7 and settings["adults"] == 1 and settings["children"] == 0

    # Not applied yet: the residents and the clock are those of the running simulation.
    state = client.get("/api/state").json()
    assert len(state["residents"]) == 3
    assert datetime.fromisoformat(state["clock"]["sim_time"]) != start

    reset = client.post("/api/simulation/reset")
    assert reset.status_code == 200
    new_state = reset.json()
    assert datetime.fromisoformat(new_state["clock"]["sim_time"]) == start
    assert len(new_state["residents"]) == 1
    assert new_state["settings"]["seed"] == 7


def test_invalid_seed_is_rejected_without_change(client: TestClient) -> None:
    before = client.get("/api/simulation/settings").json()
    for body in (
        {"seed": -1},
        {"seed": 2147483648},
        {"seed": "abc"},
        {"adults": 0},
        {"children": 4},
        {"season": "monsun"},
        {"unknown": 1},
    ):
        assert client.put("/api/simulation/settings", json=body).status_code == 422
    assert client.get("/api/simulation/settings").json() == before


def test_settings_survive_a_new_simulation_on_the_same_db(tmp_path, monkeypatch) -> None:
    path = str(tmp_path / "persist.db")
    monkeypatch.setenv("SMARTHOME_DB_PATH", path)
    body = {"seed": 99, "season": "herbst", "behaviour": "homeoffice", "speed": 1, "adults": 3}
    with TestClient(app) as first:
        assert first.put("/api/simulation/settings", json=body).status_code == 200

    # A new Simulation built from the stored settings on the same database.
    conn = db.connect(path)
    try:
        stored = settings_store.load(conn)
        assert stored is not None
        restored = Simulation(stored, conn)
        for key, value in body.items():
            assert getattr(restored.state.settings, key) == value
    finally:
        conn.close()

    # And a full backend restart picks them up as well.
    with TestClient(app) as second:
        settings = second.get("/api/simulation/settings").json()
        for key, value in body.items():
            assert settings[key] == value
        assert second.get("/api/state").json()["clock"]["speed"] == 1


def test_store_round_trip_and_empty_db(sim: Simulation) -> None:
    assert settings_store.load(sim.conn) is None
    settings = Settings(seed=5, weather_mode="schnee", start_time=datetime(2026, 3, 1, 8, 30))
    settings_store.save(sim.conn, settings)
    assert settings_store.load(sim.conn) == settings
    settings_store.save(sim.conn, Settings(seed=6))
    assert settings_store.load(sim.conn) == Settings(seed=6)


# --------------------------------------------------------------------------- reset


def test_reset_returns_the_clock_to_the_start_time(client: TestClient) -> None:
    client.put("/api/simulation/speed", json={"speed": 1440})
    time.sleep(2 * TICK_REAL_S)
    start = client.get("/api/simulation/settings").json()["start_time"]
    assert _sim_time(client) > datetime.fromisoformat(start)

    response = client.post("/api/simulation/reset")
    assert response.status_code == 200
    state = response.json()
    assert datetime.fromisoformat(state["clock"]["sim_time"]) == datetime.fromisoformat(start)
    assert state["clock"]["speed"] == 1440
    assert any(e["source"] == "system" for e in state["activity"])
