"""Tests of what the backend skeleton itself delivers."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi.routing import APIWebSocketRoute
from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.sim.state import (
    ROOM_IDS,
    Settings,
    Thresholds,
    build_initial_state,
    raise_alert,
    resolve_alert,
)
from app.ws import MAX_MESSAGE_BYTES

CONTRACT_DEVICE_IDS = {
    *(f"{room}.{slug}" for room in ROOM_IDS for slug in ("heizung", "licht", "fenster")),
    "wohnzimmer.rollladen",
    "schlafzimmer.rollladen",
    "kinderzimmer.rollladen",
    "kueche.rollladen",
    "wohnzimmer.tv",
    "wohnzimmer.stehlampe",
    "bad.waschmaschine",
    "kueche.geschirrspueler",
    "kueche.kuehlschrank",
    "kueche.backofen",
    "kueche.kaffeemaschine",
}

CONTRACT_ROUTES = {
    ("GET", "/api/health"),
    ("GET", "/api/state"),
    ("PATCH", "/api/devices/{device_id}"),
    ("POST", "/api/events"),
    ("GET", "/api/alerts"),
    ("POST", "/api/alerts/{alert_id}/acknowledge"),
    ("GET", "/api/thresholds"),
    ("PUT", "/api/thresholds"),
    ("GET", "/api/automations"),
    ("POST", "/api/automations"),
    ("PUT", "/api/automations/{id}"),
    ("PATCH", "/api/automations/{id}/enabled"),
    ("DELETE", "/api/automations/{id}"),
    ("GET", "/api/history"),
    ("POST", "/api/simulation/pause"),
    ("POST", "/api/simulation/resume"),
    ("PUT", "/api/simulation/speed"),
    ("GET", "/api/simulation/settings"),
    ("PUT", "/api/simulation/settings"),
    ("POST", "/api/simulation/reset"),
}


def receive_until(ws, wanted: str, limit: int = 50) -> dict:
    """The next message of type ``wanted``, skipping the loop's state broadcasts."""
    for _ in range(limit):
        message = ws.receive_json()
        if message["type"] == wanted:
            return message
    raise AssertionError(f"no {wanted!r} message within {limit} messages")


def test_health_answers_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_state_has_six_rooms_and_every_contract_device(client: TestClient) -> None:
    state = client.get("/api/state").json()
    assert [room["id"] for room in state["rooms"]] == list(ROOM_IDS)
    assert {device["id"] for device in state["devices"]} == CONTRACT_DEVICE_IDS
    assert len(state["residents"]) == 3  # 2 adults + 1 child by default
    assert state["thresholds"] == Thresholds().model_dump()
    assert state["alerts"] == [] and state["activity"] == [] and state["active_events"] == []
    assert state["base_load_w"] > 0


def test_websocket_sends_state_on_connect_and_time_moves(client: TestClient) -> None:
    with client.websocket_connect("/ws") as ws:
        first = ws.receive_json()
        assert first["type"] == "state"
        assert len(first["state"]["rooms"]) == 6
        start = datetime.fromisoformat(first["state"]["clock"]["sim_time"])
        for _ in range(20):
            message = receive_until(ws, "state")
            if datetime.fromisoformat(message["state"]["clock"]["sim_time"]) > start:
                break
        else:
            pytest.fail("simulation time did not move forward")


def test_websocket_ping_pong(client: TestClient) -> None:
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "ping"})
        assert receive_until(ws, "pong") == {"type": "pong"}


@pytest.mark.parametrize(
    "payload",
    [
        '{"type": "ping", "pad": "' + "x" * (MAX_MESSAGE_BYTES + 1) + '"}',
        "this is not json {",
        '{"type": "set_everything"}',
    ],
    ids=["oversize", "non-json", "unknown-type"],
)
def test_websocket_bad_message_yields_error_and_keeps_connection(
    client: TestClient, payload: str
) -> None:
    with client.websocket_connect("/ws") as ws:
        ws.send_text(payload)
        error = receive_until(ws, "error")
        assert isinstance(error["detail"], str) and error["detail"]
        ws.send_json({"type": "ping"})
        assert receive_until(ws, "pong") == {"type": "pong"}


def test_bad_message_does_not_disconnect_other_clients(client: TestClient) -> None:
    with client.websocket_connect("/ws") as bad, client.websocket_connect("/ws") as good:
        bad.send_text("x" * (MAX_MESSAGE_BYTES * 2))
        receive_until(bad, "error")
        good.send_json({"type": "ping"})
        assert receive_until(good, "pong") == {"type": "pong"}
        assert receive_until(good, "state")["type"] == "state"


def test_advance_moves_sim_time_by_dt(sim) -> None:
    before = sim.state.clock.sim_time
    sim.advance(120)
    assert sim.state.clock.sim_time - before == timedelta(seconds=120)
    sim.advance(0.5)
    assert sim.state.clock.sim_time - before == timedelta(seconds=120.5)


def test_log_keeps_newest_first_and_at_most_200(sim) -> None:
    for index in range(205):
        sim.log(f"Eintrag {index}", "system")
    assert len(sim.state.activity) == 200
    assert sim.state.activity[0].message == "Eintrag 204"


def test_reset_restores_initial_state(sim) -> None:
    first_draw = sim.rng.random()
    sim.advance(3600)
    sim.log("vorher", "benutzer")
    sim.reset()
    assert sim.state.clock.sim_time == sim.state.settings.start_time
    assert sim.state.activity == []
    assert sim.rng.random() == first_draw


def test_every_contract_route_is_registered() -> None:
    # Read from the generated route table (OpenAPI), never from what a request answers.
    registered = {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    }
    assert registered >= CONTRACT_ROUTES
    ws_paths = {route.path for route in app.routes if isinstance(route, APIWebSocketRoute)}
    assert "/ws" in ws_paths


def test_initial_state_follows_settings() -> None:
    state = build_initial_state(Settings(adults=4, children=3, behaviour="urlaub", seed=7))
    assert len(state.residents) == 7
    assert all(resident.room_id is None for resident in state.residents)
    assert state.settings.seed == 7
    by_id = {room.id: room for room in state.rooms}
    assert by_id["kueche"].smoke is False and by_id["bad"].smoke is None
    assert by_id["bad"].leak is False and by_id["flur"].door_open is False


def test_raise_and_resolve_alert() -> None:
    state = build_initial_state(Settings())
    now = state.clock.sim_time
    alert = raise_alert(state, "zu_kalt", "bad", "Bad ist zu kalt", "warnung", now)
    assert alert.id == "zu_kalt:bad" and alert.active and not alert.acknowledged
    alert.acknowledged = True
    again = raise_alert(state, "zu_kalt", "bad", "Bad ist zu kalt", "warnung", now)
    assert again is alert and again.acknowledged and len(state.alerts) == 1
    resolve_alert(state, "zu_kalt:bad")
    assert not alert.active
    later = now + timedelta(hours=1)
    raised = raise_alert(state, "zu_kalt", "bad", "Bad ist zu kalt", "kritisch", later)
    assert raised.active and not raised.acknowledged and raised.raised_at == later
    assert len(state.alerts) == 1
    house = raise_alert(state, "verbrauch_hoch", None, "Verbrauch hoch", "warnung", later)
    assert house.id == "verbrauch_hoch:haus"


def test_schema_has_all_tables(tmp_path) -> None:
    conn = db.connect(str(tmp_path / "nested" / "schema.db"))
    try:
        db.init_schema(conn)
        db.init_schema(conn)  # idempotent
        names = {
            row["name"]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type IN ('table', 'index')"
            )
        }
    finally:
        conn.close()
    assert {"settings", "thresholds", "automations", "history"} <= names
    assert "idx_history_metric_time" in names


def test_thresholds_reject_min_not_below_max() -> None:
    with pytest.raises(ValueError):
        Thresholds(room_min_c=22, room_max_c=20)


def test_cors_allows_lan_origin(client: TestClient) -> None:
    response = client.get("/api/health", headers={"Origin": "http://192.168.1.23:5173"})
    assert response.headers.get("access-control-allow-origin") == "http://192.168.1.23:5173"
    other = client.get("/api/health", headers={"Origin": "http://example.com"})
    assert "access-control-allow-origin" not in other.headers
