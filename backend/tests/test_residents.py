"""Tests of the residents' daily routine (app.sim.residents)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime

import pytest

from app import db
from app.engine import Simulation
from app.sim import residents
from app.sim.state import Settings

START = datetime(2026, 1, 15, 6, 0, 0)


@pytest.fixture
def make_sim() -> Iterator:
    conns = []

    def _make(**overrides: object) -> Simulation:
        conn = db.connect(":memory:")
        db.init_schema(conn)
        conns.append(conn)
        return Simulation(Settings(start_time=START, **overrides), conn)

    yield _make
    for conn in conns:
        conn.close()


def _room(sim: Simulation, room_id: str):
    return next(r for r in sim.state.rooms if r.id == room_id)


def _device(sim: Simulation, device_id: str):
    return next(d for d in sim.state.devices if d.id == device_id)


def _run_minutes(sim: Simulation, minutes: int, observe) -> None:
    for _ in range(minutes):
        sim.advance(60)
        observe(sim)


def test_standard_morning_shower_motion_and_light_follow_residents(make_sim) -> None:
    sim = make_sim(behaviour="standard")
    seen = {"duschen": False, "bad_motion": False, "bad_light": False, "coffee": False}
    seen["door"] = False

    def observe(s: Simulation) -> None:
        bad = _room(s, "bad")
        if bad.activity == "duschen":
            seen["duschen"] = True
            assert any(r.room_id == "bad" for r in s.state.residents)
            seen["bad_motion"] |= bad.motion and bad.last_motion_at == s.state.clock.sim_time
            seen["bad_light"] |= _device(s, "bad.licht").on
        seen["coffee"] |= _device(s, "kueche.kaffeemaschine").on
        seen["door"] |= bool(_room(s, "flur").door_open)

    _run_minutes(sim, 150, observe)  # 06:00 -> 08:30
    assert all(seen.values()), seen


def test_standard_residents_leave_and_empty_rooms_clear(make_sim) -> None:
    sim = make_sim(behaviour="standard")
    sim.advance(5 * 3600)  # 11:00
    assert all(r.room_id is None for r in sim.state.residents)
    for room in sim.state.rooms:
        assert room.motion is False
        assert room.activity == "none"
    assert _room(sim, "flur").door_open is False
    assert not _device(sim, "bad.licht").on
    assert any("verlässt das Haus" in e.message for e in sim.state.activity)


def test_standard_evening_cooking_and_tv(make_sim) -> None:
    sim = make_sim(behaviour="standard")
    sim.advance(12 * 3600)  # 18:00
    assert _room(sim, "kueche").activity == "kochen"
    assert _device(sim, "kueche.backofen").on
    assert _device(sim, "kueche.backofen").program is not None
    sim.advance(2 * 3600)  # 20:00
    assert _device(sim, "wohnzimmer.tv").on
    assert not _device(sim, "kueche.backofen").on
    assert _room(sim, "wohnzimmer").motion
    sim.advance(4 * 3600)  # 00:00
    assert _room(sim, "schlafzimmer").activity == "schlafen"
    assert not _device(sim, "wohnzimmer.tv").on


def test_urlaub_produces_no_motion_over_a_day(make_sim) -> None:
    sim = make_sim(behaviour="urlaub")

    def observe(s: Simulation) -> None:
        assert all(r.room_id is None for r in s.state.residents)
        assert not any(room.motion for room in s.state.rooms)

    for _ in range(24 * 6):
        sim.advance(600)
        observe(sim)


def test_homeoffice_adults_stay_home_during_the_day(make_sim) -> None:
    sim = make_sim(behaviour="homeoffice")
    sim.advance(4 * 3600)  # 10:00
    adults = [r for r in sim.state.residents if r.role == "erwachsen"]
    children = [r for r in sim.state.residents if r.role == "kind"]
    assert all(r.room_id is not None for r in adults)
    assert all(r.room_id is None for r in children)
    for adult in adults:
        assert _room(sim, adult.room_id).motion


def test_same_seed_reproduces_resident_positions(make_sim) -> None:
    def trace(seed: int) -> list:
        sim = make_sim(seed=seed)
        points = []
        for _ in range(2 * 24 * 12):
            sim.advance(300)
            points.append(tuple((r.id, r.room_id, r.activity) for r in sim.state.residents))
        return points

    assert trace(7) == trace(7)


def test_user_switching_tv_off_is_not_overridden(make_sim) -> None:
    sim = make_sim(behaviour="standard")
    sim.advance(14 * 3600)  # 20:00, TV running
    tv = _device(sim, "wohnzimmer.tv")
    assert tv.on
    tv.on = False
    sim.advance(600)
    assert not _device(sim, "wohnzimmer.tv").on


def test_plan_shower_slots_do_not_overlap() -> None:
    jitter = residents.Jitter(shower=residents.SHOWER_JITTER_MIN)
    for minute in range(6 * 60, 9 * 60):
        in_bad = [
            slot
            for slot in range(7)
            if residents.plan("erwachsen", slot, slot, "standard", minute, jitter)[0] == "bad"
        ]
        assert len(in_bad) <= 1
