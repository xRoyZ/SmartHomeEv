"""Triggerable events: effects, alerts, timed reverts and the POST /api/events endpoint."""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.engine import Simulation
from app.sim import events
from app.sim.state import ThermostatDevice, WindowDevice


def _room(sim: Simulation, room_id: str):
    return next(r for r in sim.state.rooms if r.id == room_id)


def _window(sim: Simulation, room_id: str) -> WindowDevice:
    return next(
        d for d in sim.state.devices if isinstance(d, WindowDevice) and d.room_id == room_id
    )


def _active_alert(sim: Simulation, alert_id: str):
    return next((a for a in sim.state.alerts if a.id == alert_id and a.active), None)


def _pass_time(sim: Simulation, delta: timedelta) -> None:
    """Move the clock and run only the events module (other modules are not under test)."""
    sim.state.clock.sim_time += delta
    events.step(sim, delta.total_seconds())


def test_fenster_vergessen_opens_a_window_and_raises_alert(sim: Simulation) -> None:
    event = events.trigger(sim, "fenster_vergessen")
    assert event.room_id is not None
    assert _window(sim, event.room_id).open is True
    alert = _active_alert(sim, f"fenster_heizung:{event.room_id}")
    assert alert is not None and alert.message
    assert event in sim.state.active_events
    assert sim.state.activity[0].source == "ereignis"


def test_fenster_vergessen_prefers_heated_room(sim: Simulation) -> None:
    heated = {d.room_id for d in sim.state.devices if isinstance(d, ThermostatDevice) and d.heating}
    assert heated, "the initial winter house heats at least one room"
    event = events.trigger(sim, "fenster_vergessen")
    assert event.room_id in heated


def test_forgotten_window_stays_until_closed(sim: Simulation) -> None:
    event = events.trigger(sim, "fenster_vergessen")
    _pass_time(sim, timedelta(hours=10))
    assert _window(sim, event.room_id).open is True
    assert any(e.type == "fenster_vergessen" for e in sim.state.active_events)

    _window(sim, event.room_id).open = False
    _pass_time(sim, timedelta(seconds=60))
    assert not any(e.type == "fenster_vergessen" for e in sim.state.active_events)
    assert _active_alert(sim, f"fenster_heizung:{event.room_id}") is None


def test_wasserschaden_sets_leak_and_stays(sim: Simulation) -> None:
    event = events.trigger(sim, "wasserschaden")
    assert event.room_id in ("bad", "kueche")
    assert event.ends_at is None
    assert _room(sim, event.room_id).leak is True
    assert _active_alert(sim, f"wasser:{event.room_id}").severity == "kritisch"

    _pass_time(sim, timedelta(hours=24))
    assert _room(sim, event.room_id).leak is True
    assert any(e.type == "wasserschaden" for e in sim.state.active_events)


def test_rauch_kueche_sets_smoke_and_clears_after_timeout(sim: Simulation) -> None:
    event = events.trigger(sim, "rauch_kueche")
    assert _room(sim, "kueche").smoke is True
    assert _active_alert(sim, "rauch:kueche") is not None
    assert event.ends_at is not None and event.ends_at > event.started_at

    _pass_time(sim, event.ends_at - sim.state.clock.sim_time + timedelta(seconds=1))
    assert _room(sim, "kueche").smoke is False
    assert not any(e.type == "rauch_kueche" for e in sim.state.active_events)


def test_stromspitze_raises_extra_load_and_reverts(sim: Simulation) -> None:
    before = sim.state.solar.consumption_w
    event = events.trigger(sim, "stromspitze")
    assert sim.state.extra_load_w > sim.state.thresholds.power_max_w
    assert sim.state.solar.consumption_w > before
    assert _active_alert(sim, "verbrauch_hoch:haus") is not None

    _pass_time(sim, event.ends_at - sim.state.clock.sim_time + timedelta(seconds=1))
    assert sim.state.extra_load_w == 0
    assert sim.state.solar.consumption_w == pytest.approx(before, abs=1e-2)
    assert not sim.state.active_events


def test_heizungsausfall_fails_thermostats_and_repairs(sim: Simulation) -> None:
    event = events.trigger(sim, "heizungsausfall")
    thermostats = [d for d in sim.state.devices if isinstance(d, ThermostatDevice)]
    assert thermostats and all(t.failed and not t.heating for t in thermostats)
    assert _active_alert(sim, "heizungsausfall:haus") is not None

    _pass_time(sim, event.ends_at - sim.state.clock.sim_time + timedelta(seconds=1))
    assert not any(t.failed for t in thermostats)
    assert not sim.state.active_events


def test_retrigger_replaces_timed_event(sim: Simulation) -> None:
    events.trigger(sim, "rauch_kueche")
    events.trigger(sim, "rauch_kueche")
    assert sum(e.type == "rauch_kueche" for e in sim.state.active_events) == 1


def test_reset_clears_events(sim: Simulation) -> None:
    events.trigger(sim, "wasserschaden")
    sim.reset()
    assert not sim.state.active_events
    assert all(r.leak in (None, False) for r in sim.state.rooms)


def test_engine_advance_runs_event_step(sim: Simulation) -> None:
    events.trigger(sim, "stromspitze")
    sim.advance(20 * 60)
    assert not any(e.type == "stromspitze" for e in sim.state.active_events)
    assert sim.state.extra_load_w == 0


# --------------------------------------------------------------------------- API


def test_post_rauch_kueche_shows_smoke_and_alert_in_state(client) -> None:
    response = client.post("/api/events", json={"type": "rauch_kueche"})
    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "rauch_kueche"
    assert body["room_id"] == "kueche"

    state = client.get("/api/state").json()
    kitchen = next(r for r in state["rooms"] if r["id"] == "kueche")
    assert kitchen["smoke"] is True
    assert any(a["kind"] == "rauch" and a["active"] for a in state["alerts"])
    assert any(e["type"] == "rauch_kueche" for e in state["active_events"])
    assert any(entry["source"] == "ereignis" for entry in state["activity"])


@pytest.mark.parametrize(
    "event_type",
    ["fenster_vergessen", "wasserschaden", "rauch_kueche", "stromspitze", "heizungsausfall"],
)
def test_post_every_event_type_creates_alert(client, event_type: str) -> None:
    response = client.post("/api/events", json={"type": event_type})
    assert response.status_code == 201
    state = client.get("/api/state").json()
    assert any(a["active"] for a in state["alerts"])
    assert any(e["type"] == event_type for e in state["active_events"])


@pytest.mark.parametrize(
    "payload",
    [
        {"type": "erdbeben"},
        {},
        {"type": 5},
        {"type": "rauch_kueche", "extra": True},
    ],
)
def test_post_invalid_event_is_422_without_state_change(client, payload: dict) -> None:
    response = client.post("/api/events", json=payload)
    assert response.status_code == 422
    state = client.get("/api/state").json()
    # The loop keeps running, so compare only what an event would have changed.
    assert state["active_events"] == []
    assert state["extra_load_w"] == 0
    assert all(not r["smoke"] and not r["leak"] for r in state["rooms"])
    assert not any(d.get("failed") for d in state["devices"])
    assert not any(e["source"] == "ereignis" for e in state["activity"])
