"""Alerts, acknowledgement and thresholds."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import db
from app.engine import Simulation
from app.sim import alerts
from app.sim.state import Settings, ThermostatDevice, Thresholds, WindowDevice
from app.store import thresholds as thresholds_store


def _alert(sim: Simulation, alert_id: str):
    return next((a for a in sim.state.alerts if a.id == alert_id), None)


def _receive_state(ws, predicate, limit: int = 60) -> dict:
    """The next broadcast state for which ``predicate`` holds."""
    for _ in range(limit):
        message = ws.receive_json()
        if message["type"] == "state" and predicate(message["state"]):
            return message["state"]
    raise AssertionError("no matching state broadcast")


def test_lowering_co2_limit_raises_alert_on_next_step(sim: Simulation) -> None:
    room = sim.state.rooms[0]
    room.co2_ppm = 900.0
    alerts.step(sim, 1.0)
    assert _alert(sim, f"co2_hoch:{room.id}") is None

    sim.state.thresholds = Thresholds(co2_max_ppm=800)
    alerts.step(sim, 1.0)
    alert = _alert(sim, f"co2_hoch:{room.id}")
    assert alert is not None
    assert alert.active and not alert.acknowledged
    assert alert.room_id == room.id


def test_alert_resolves_and_reraises_unacknowledged(sim: Simulation) -> None:
    room = sim.state.rooms[0]
    room.temperature_c = 10.0
    alerts.step(sim, 1.0)
    alert = _alert(sim, f"zu_kalt:{room.id}")
    assert alert is not None and alert.active
    alert.acknowledged = True

    room.temperature_c = 21.0
    alerts.step(sim, 1.0)
    assert not _alert(sim, f"zu_kalt:{room.id}").active

    room.temperature_c = 10.0
    alerts.step(sim, 1.0)
    again = _alert(sim, f"zu_kalt:{room.id}")
    assert again.active and not again.acknowledged


def test_every_kind_is_evaluated(sim: Simulation) -> None:
    state = sim.state
    rooms = {r.id: r for r in state.rooms}
    rooms["wohnzimmer"].temperature_c = 30.0
    rooms["kueche"].smoke = True
    rooms["bad"].leak = True
    state.solar.consumption_w = 9000.0
    for device in state.devices:
        if isinstance(device, ThermostatDevice) and device.room_id == "schlafzimmer":
            device.heating = True
        if isinstance(device, WindowDevice) and device.room_id == "schlafzimmer":
            device.open = True
        if isinstance(device, ThermostatDevice) and device.room_id == "flur":
            device.failed = True
    alerts.step(sim, 1.0)
    active = {a.id for a in state.alerts if a.active}
    assert {
        "zu_warm:wohnzimmer",
        "rauch:kueche",
        "wasser:bad",
        "verbrauch_hoch:haus",
        "fenster_heizung:schlafzimmer",
        "heizungsausfall:flur",
    } <= active
    assert _alert(sim, "rauch:kueche").severity == "kritisch"


def test_rooms_without_sensor_never_alert(sim: Simulation) -> None:
    alerts.step(sim, 1.0)
    assert _alert(sim, "rauch:bad") is None
    assert _alert(sim, "wasser:flur") is None


def test_thresholds_put_raises_zu_kalt_and_ack_reaches_ws(client: TestClient) -> None:
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()
        response = client.put(
            "/api/thresholds",
            json={"room_min_c": 25, "room_max_c": 30, "co2_max_ppm": 1200, "power_max_w": 6000},
        )
        assert response.status_code == 200
        assert response.json()["room_min_c"] == 25

        listed = client.get("/api/alerts").json()
        cold = [a for a in listed if a["kind"] == "zu_kalt" and a["active"]]
        assert cold, listed
        alert_id = cold[0]["id"]

        ack = client.post(f"/api/alerts/{alert_id}/acknowledge")
        assert ack.status_code == 200
        assert ack.json()["acknowledged"] is True

        def acknowledged(state: dict) -> bool:
            return any(a["id"] == alert_id and a["acknowledged"] for a in state["alerts"])

        state = _receive_state(ws, acknowledged)
        assert state["thresholds"]["room_min_c"] == 25


def test_acknowledge_unknown_alert_is_404(client: TestClient) -> None:
    assert client.post("/api/alerts/zu_kalt:garage/acknowledge").status_code == 404


def test_invalid_thresholds_are_422_and_change_nothing(client: TestClient) -> None:
    before = client.get("/api/thresholds").json()
    bad_bodies = [
        {"room_min_c": 22, "room_max_c": 22, "co2_max_ppm": 1200, "power_max_w": 6000},
        {"room_min_c": 2, "room_max_c": 26, "co2_max_ppm": 1200, "power_max_w": 6000},
        {"room_min_c": 18, "room_max_c": 26, "co2_max_ppm": 99999, "power_max_w": 6000},
        {"room_min_c": 18, "room_max_c": 26, "co2_max_ppm": 1200, "power_max_w": 6000, "x": 1},
        {"room_min_c": "kalt", "room_max_c": 26, "co2_max_ppm": 1200, "power_max_w": 6000},
    ]
    for body in bad_bodies:
        assert client.put("/api/thresholds", json=body).status_code == 422, body
    assert client.get("/api/thresholds").json() == before


def test_thresholds_survive_new_simulation_on_same_db(tmp_path) -> None:
    path = str(tmp_path / "thresholds.db")
    conn = db.connect(path)
    db.init_schema(conn)
    custom = Thresholds(room_min_c=16, room_max_c=28, co2_max_ppm=900, power_max_w=4000)
    thresholds_store.save(conn, custom)
    conn.close()

    conn = db.connect(path)
    try:
        sim = Simulation(Settings(), conn)
        assert sim.state.thresholds == Thresholds()
        thresholds_store.load(sim)
        assert sim.state.thresholds == custom
    finally:
        conn.close()


def test_thresholds_put_persists_across_restart(tmp_path, monkeypatch) -> None:
    from app.main import app

    monkeypatch.setenv("SMARTHOME_DB_PATH", str(tmp_path / "restart.db"))
    body = {"room_min_c": 17.5, "room_max_c": 27, "co2_max_ppm": 1000, "power_max_w": 5000}
    with TestClient(app) as first:
        assert first.put("/api/thresholds", json=body).status_code == 200
    with TestClient(app) as second:
        assert second.get("/api/thresholds").json() == body


def test_reset_restores_default_thresholds(sim: Simulation) -> None:
    thresholds_store.save(sim.conn, Thresholds(co2_max_ppm=700))
    thresholds_store.on_reset(sim)
    assert sim.state.thresholds == Thresholds()
    assert thresholds_store.read(sim.conn) == Thresholds()
