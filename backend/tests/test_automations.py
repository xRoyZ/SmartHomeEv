"""Tests of the automations engine, its persistence and the CRUD endpoints."""

from __future__ import annotations

import time
from datetime import timedelta

import pytest

from app import db
from app.engine import Simulation
from app.sim import automations as engine
from app.sim.state import AutomationIn, Settings
from app.store import automations as store

DEFAULT_NAMES = {
    "Heizung aus, wenn Fenster offen",
    "Rollläden runter bei Sonnenuntergang",
    "Licht aus, wenn 10 Minuten keine Bewegung",
}


def _device(sim: Simulation, device_id: str):
    return next(d for d in sim.state.devices if d.id == device_id)


def _room(sim: Simulation, room_id: str):
    return next(r for r in sim.state.rooms if r.id == room_id)


def _add(sim: Simulation, rule: dict) -> AutomationIn:
    """Store ``rule`` and put it into the state the way the API does."""
    body = AutomationIn.model_validate(rule)
    assert engine.validate_action(sim.state, body.action) is None
    created = store.insert(sim.conn, body)
    sim.state.automations.append(created)
    engine.forget(sim, created.id)
    return created


def _automation_entries(sim: Simulation) -> list[str]:
    return [e.message for e in sim.state.activity if e.source == "automation"]


@pytest.fixture
def bare_sim(sim: Simulation) -> Simulation:
    """A simulation without any automation, primed so nothing fires on its own."""
    sim.state.automations = []
    engine.prime(sim)
    return sim


# --------------------------------------------------------------------------- defaults


def test_default_automations_are_valid_for_the_house(sim: Simulation) -> None:
    defaults = engine.default_automations()
    assert {a.name for a in defaults} == DEFAULT_NAMES
    for automation in defaults:
        assert automation.enabled
        assert engine.validate_action(sim.state, automation.action) is None


def test_open_schlafzimmer_window_turns_heating_off_and_logs(sim: Simulation) -> None:
    store.load(sim)
    heizung = _device(sim, "schlafzimmer.heizung")
    _room(sim, "schlafzimmer").temperature_c = 17.0
    heizung.heating = True
    sim.advance(1)
    assert all("Heizung aus" not in m for m in _automation_entries(sim))

    _device(sim, "schlafzimmer.fenster").open = True
    sim.advance(1)

    assert heizung.target_c == pytest.approx(5)
    assert heizung.heating is False
    entry = next(e for e in sim.state.activity if e.source == "automation")
    assert "Heizung aus, wenn Fenster offen" in entry.message
    assert entry.sim_time == sim.state.clock.sim_time
    rule = next(a for a in sim.state.automations if a.name.startswith("Heizung aus"))
    assert rule.last_fired_at == sim.state.clock.sim_time


# --------------------------------------------------------------------------- condition types


def test_contact_condition_fires_once_on_rising_edge(bare_sim: Simulation) -> None:
    sim = bare_sim
    _add(
        sim,
        {
            "name": "Licht an bei offenem Küchenfenster",
            "enabled": True,
            "condition": {"type": "contact", "device_id": "kueche.fenster", "open": True},
            "action": {"device_id": "kueche.licht", "set": {"on": True}},
        },
    )
    sim.advance(1)
    assert _device(sim, "kueche.licht").on is False
    _device(sim, "kueche.fenster").open = True
    sim.advance(1)
    assert _device(sim, "kueche.licht").on is True
    # Still open: no second firing even if the light was switched off meanwhile.
    _device(sim, "kueche.licht").on = False
    sim.advance(30)
    assert _device(sim, "kueche.licht").on is False
    assert len(_automation_entries(sim)) == 1


def test_sensor_condition_fires(bare_sim: Simulation) -> None:
    sim = bare_sim
    _room(sim, "bad").humidity_pct = 50
    _add(
        sim,
        {
            "name": "Lüften",
            "enabled": True,
            "condition": {
                "type": "sensor",
                "room_id": "bad",
                "metric": "humidity_pct",
                "op": ">",
                "value": 70,
            },
            "action": {"device_id": "bad.fenster", "set": {"open": True}},
        },
    )
    sim.advance(1)
    assert _device(sim, "bad.fenster").open is False
    _room(sim, "bad").humidity_pct = 85
    sim.advance(1)
    assert _device(sim, "bad.fenster").open is True


def test_outdoor_sensor_condition_fires(bare_sim: Simulation) -> None:
    sim = bare_sim
    sim.state.outdoor.temperature_c = 5.0
    _add(
        sim,
        {
            "name": "Frost",
            "enabled": True,
            "condition": {
                "type": "sensor",
                "room_id": None,
                "metric": "temperature_c",
                "op": "<",
                "value": 0,
            },
            "action": {"device_id": "flur.heizung", "set": {"target_c": 22}},
        },
    )
    sim.advance(1)
    assert _device(sim, "flur.heizung").target_c == pytest.approx(18)
    sim.state.outdoor.temperature_c = -3.0
    sim.advance(1)
    assert _device(sim, "flur.heizung").target_c == pytest.approx(22)


def test_motion_condition_fires_after_minutes_without_motion(bare_sim: Simulation) -> None:
    sim = bare_sim
    room = _room(sim, "wohnzimmer")
    room.motion = True
    room.last_motion_at = sim.state.clock.sim_time
    _device(sim, "wohnzimmer.licht").on = True
    _add(
        sim,
        {
            "name": "Licht aus Wohnzimmer",
            "enabled": True,
            "condition": {
                "type": "motion",
                "room_id": "wohnzimmer",
                "detected": False,
                "minutes": 10,
            },
            "action": {"device_id": "wohnzimmer.licht", "set": {"on": False}},
        },
    )
    sim.advance(60)
    room.motion = False
    room.last_motion_at = sim.state.clock.sim_time
    sim.advance(5 * 60)
    assert _device(sim, "wohnzimmer.licht").on is True
    sim.advance(6 * 60)
    assert _device(sim, "wohnzimmer.licht").on is False


def test_motion_detected_condition_fires(bare_sim: Simulation) -> None:
    sim = bare_sim
    _add(
        sim,
        {
            "name": "Licht an bei Bewegung",
            "enabled": True,
            "condition": {"type": "motion", "room_id": "flur", "detected": True, "minutes": 1},
            "action": {"device_id": "flur.licht", "set": {"on": True, "brightness": 60}},
        },
    )
    # Only the automations step: the residents module drives motion while advancing.
    flur = _room(sim, "flur")
    flur.motion = False
    flur.last_motion_at = None
    engine.step(sim, 1)
    assert _device(sim, "flur.licht").on is False
    flur.motion = True
    engine.step(sim, 1)
    light = _device(sim, "flur.licht")
    assert light.on is True
    assert light.brightness == 60


def test_time_condition_fires_when_clock_crosses(bare_sim: Simulation) -> None:
    sim = bare_sim
    start = sim.state.clock.sim_time  # 06:00
    _add(
        sim,
        {
            "name": "Kaffee",
            "enabled": True,
            "condition": {"type": "time", "at": "06:30"},
            "action": {"device_id": "kueche.kaffeemaschine", "set": {"on": True}},
        },
    )
    sim.advance(29 * 60)
    assert _device(sim, "kueche.kaffeemaschine").on is False
    sim.advance(2 * 60)
    assert _device(sim, "kueche.kaffeemaschine").on is True
    fired_at = next(a for a in sim.state.automations if a.name == "Kaffee").last_fired_at
    assert start + timedelta(minutes=30) <= fired_at <= start + timedelta(minutes=31)
    _device(sim, "kueche.kaffeemaschine").on = False
    sim.advance(60 * 60)
    assert _device(sim, "kueche.kaffeemaschine").on is False


def test_sun_condition_fires(bare_sim: Simulation) -> None:
    sim = bare_sim
    sim.state.outdoor.sun_up = True
    _device(sim, "kinderzimmer.rollladen").position = 0
    _add(
        sim,
        {
            "name": "Rollladen zu",
            "enabled": True,
            "condition": {"type": "sun", "state": "down"},
            "action": {"device_id": "kinderzimmer.rollladen", "set": {"position": 100}},
        },
    )
    # Only the automations step: the environment module would recompute the sun.
    engine.step(sim, 1)
    assert _device(sim, "kinderzimmer.rollladen").position == 0
    sim.state.outdoor.sun_up = False
    engine.step(sim, 1)
    assert _device(sim, "kinderzimmer.rollladen").position == 100


def test_sun_condition_evaluation() -> None:
    conn = db.connect(":memory:")
    db.init_schema(conn)
    sim = Simulation(Settings(), conn)
    rule = AutomationIn.model_validate(
        {
            "name": "x",
            "enabled": True,
            "condition": {"type": "sun", "state": "up"},
            "action": {"device_id": "wohnzimmer.rollladen", "set": {"position": 0}},
        }
    )
    sim.state.outdoor.sun_up = True
    assert engine.condition_true(sim.state, rule) is True
    sim.state.outdoor.sun_up = False
    assert engine.condition_true(sim.state, rule) is False
    conn.close()


def test_disabled_automation_never_fires(bare_sim: Simulation) -> None:
    sim = bare_sim
    _add(
        sim,
        {
            "name": "Aus",
            "enabled": False,
            "condition": {"type": "contact", "device_id": "bad.fenster", "open": True},
            "action": {"device_id": "bad.licht", "set": {"on": True}},
        },
    )
    _device(sim, "bad.fenster").open = True
    sim.advance(120)
    assert _device(sim, "bad.licht").on is False
    assert _automation_entries(sim) == []


def test_enabled_later_fires_when_condition_already_true(bare_sim: Simulation) -> None:
    sim = bare_sim
    created = _add(
        sim,
        {
            "name": "Später",
            "enabled": False,
            "condition": {"type": "contact", "device_id": "bad.fenster", "open": True},
            "action": {"device_id": "bad.licht", "set": {"on": True}},
        },
    )
    _device(sim, "bad.fenster").open = True
    sim.advance(10)
    created.enabled = True
    engine.forget(sim, created.id)
    sim.advance(1)
    assert _device(sim, "bad.licht").on is True


# --------------------------------------------------------------------------- persistence


def test_first_load_writes_defaults_once(sim: Simulation) -> None:
    store.load(sim)
    assert {a.name for a in sim.state.automations} == DEFAULT_NAMES
    for automation in list(sim.state.automations):
        store.delete(sim.conn, automation.id)
    store.load(sim)
    assert sim.state.automations == []


def test_reset_restores_defaults(sim: Simulation) -> None:
    store.load(sim)
    for automation in list(sim.state.automations):
        store.delete(sim.conn, automation.id)
    sim.reset()
    assert {a.name for a in sim.state.automations} == DEFAULT_NAMES
    assert store.count(sim.conn) == 3


def test_automations_survive_a_new_simulation(tmp_path) -> None:
    path = str(tmp_path / "persist.db")
    conn = db.connect(path)
    db.init_schema(conn)
    first = Simulation(Settings(), conn)
    store.load(first)
    _add(
        first,
        {
            "name": "Bleibt",
            "enabled": False,
            "condition": {"type": "time", "at": "07:15"},
            "action": {"device_id": "kueche.backofen", "set": {"program": "Grill"}},
        },
    )
    conn.close()

    conn = db.connect(path)
    db.init_schema(conn)
    second = Simulation(Settings(), conn)
    store.load(second)
    names = {a.name for a in second.state.automations}
    assert names == {*DEFAULT_NAMES, "Bleibt"}
    kept = next(a for a in second.state.automations if a.name == "Bleibt")
    assert kept.enabled is False
    assert kept.action.set.program == "Grill"
    conn.close()


# --------------------------------------------------------------------------- API


def _rule(**overrides) -> dict:
    rule = {
        "name": "Testregel",
        "enabled": True,
        "condition": {"type": "contact", "device_id": "kinderzimmer.fenster", "open": True},
        "action": {"device_id": "kinderzimmer.heizung", "set": {"target_c": 5}},
    }
    rule.update(overrides)
    return rule


def test_api_lists_defaults(client) -> None:
    response = client.get("/api/automations")
    assert response.status_code == 200
    assert {a["name"] for a in response.json()} == DEFAULT_NAMES


def test_api_crud(client) -> None:
    created = client.post("/api/automations", json=_rule())
    assert created.status_code == 201
    body = created.json()
    assert body["id"] > 0
    assert body["last_fired_at"] is None
    rule_id = body["id"]

    changed = client.put(f"/api/automations/{rule_id}", json=_rule(name="Neu"))
    assert changed.status_code == 200
    assert changed.json()["name"] == "Neu"

    disabled = client.patch(f"/api/automations/{rule_id}/enabled", json={"enabled": False})
    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False

    state = client.get("/api/state").json()
    stored = next(a for a in state["automations"] if a["id"] == rule_id)
    assert stored["name"] == "Neu"
    assert stored["enabled"] is False

    assert client.delete(f"/api/automations/{rule_id}").status_code == 204
    assert all(a["id"] != rule_id for a in client.get("/api/automations").json())
    assert client.delete(f"/api/automations/{rule_id}").status_code == 404


def test_api_unknown_id_404(client) -> None:
    assert client.put("/api/automations/9999", json=_rule()).status_code == 404
    assert client.patch("/api/automations/9999/enabled", json={"enabled": True}).status_code == 404


@pytest.mark.parametrize(
    "overrides",
    [
        {"name": ""},
        {"name": "x" * 81},
        {"action": {"device_id": "gibt.esnicht", "set": {"on": True}}},
        {"action": {"device_id": "kueche.licht", "set": {"target_c": 20}}},
        {"action": {"device_id": "kueche.licht", "set": {"brightness": 101}}},
        {"action": {"device_id": "kueche.heizung", "set": {"target_c": 40}}},
        {"action": {"device_id": "kueche.backofen", "set": {"program": "Raketenmodus"}}},
        {"action": {"device_id": "kueche.licht", "set": {}}},
        {"condition": {"type": "contact", "device_id": "kueche.licht", "open": True}},
        {"condition": {"type": "motion", "room_id": "keller", "detected": True, "minutes": 5}},
        {"condition": {"type": "motion", "room_id": "flur", "detected": True, "minutes": 0}},
        {"condition": {"type": "time", "at": "25:00"}},
        {
            "condition": {
                "type": "sensor",
                "room_id": None,
                "metric": "co2_ppm",
                "op": ">",
                "value": 1,
            }
        },
        {"condition": {"type": "regen"}},
        {"extra": 1},
    ],
)
def test_api_invalid_rule_422_and_state_untouched(client, overrides) -> None:
    before = client.get("/api/automations").json()
    response = client.post("/api/automations", json=_rule(**overrides))
    assert response.status_code == 422
    assert client.get("/api/automations").json() == before


def test_api_invalid_update_422(client) -> None:
    rule_id = client.post("/api/automations", json=_rule()).json()["id"]
    bad = _rule(action={"device_id": "flur.fenster", "set": {"on": True}})
    assert client.put(f"/api/automations/{rule_id}", json=bad).status_code == 422
    assert client.patch(f"/api/automations/{rule_id}/enabled", json={}).status_code == 422


def test_api_limit_409(client) -> None:
    existing = len(client.get("/api/automations").json())
    for index in range(100 - existing):
        response = client.post("/api/automations", json=_rule(name=f"Regel {index}"))
        assert response.status_code == 201
    response = client.post("/api/automations", json=_rule(name="Zu viel"))
    assert response.status_code == 409
    assert len(client.get("/api/automations").json()) == 100


def test_api_created_rule_fires_in_running_product(client) -> None:
    created = client.post(
        "/api/automations",
        json=_rule(
            condition={"type": "contact", "device_id": "kinderzimmer.fenster", "open": True},
            action={"device_id": "kinderzimmer.licht", "set": {"on": True}},
        ),
    )
    assert created.status_code == 201
    sim = client.app.state.sim
    _device(sim, "kinderzimmer.fenster").open = True
    deadline = time.monotonic() + 5
    entries: list = []
    while time.monotonic() < deadline:
        state = client.get("/api/state").json()
        entries = [
            e
            for e in state["activity"]
            if e["source"] == "automation" and "Testregel" in e["message"]
        ]
        if entries:
            break
        time.sleep(0.1)
    assert entries
    light = next(d for d in state["devices"] if d["id"] == "kinderzimmer.licht")
    assert light["on"] is True
