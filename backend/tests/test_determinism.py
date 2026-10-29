"""Same seed, same settings, same inputs -> identical simulation state (AC-12)."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator

import pytest

from app import db
from app.engine import Simulation
from app.sim.state import Settings, build_initial_state


@pytest.fixture
def connections() -> Iterator[list[sqlite3.Connection]]:
    opened: list[sqlite3.Connection] = []
    yield opened
    for conn in opened:
        conn.close()


def _new_sim(settings: Settings, connections: list[sqlite3.Connection]) -> Simulation:
    conn = db.connect(":memory:")
    db.init_schema(conn)
    connections.append(conn)
    return Simulation(settings, conn)


def _device(sim: Simulation, device_id: str):
    return next(d for d in sim.state.devices if d.id == device_id)


def _run_script(sim: Simulation) -> None:
    """A fixed sequence of device changes and clock advances."""
    sim.advance(1800)
    _device(sim, "wohnzimmer.licht").on = True
    _device(sim, "wohnzimmer.licht").brightness = 60
    sim.advance(3600)
    _device(sim, "schlafzimmer.fenster").open = True
    _device(sim, "wohnzimmer.heizung").target_c = 23.5
    sim.advance(7200)
    _device(sim, "schlafzimmer.fenster").open = False
    _device(sim, "wohnzimmer.rollladen").position = 80
    sim.advance(5 * 3600 + 17)


def _state_json(sim: Simulation) -> str:
    return json.dumps(sim.state.model_dump(mode="json"), sort_keys=True)


@pytest.mark.parametrize(
    "settings",
    [
        Settings(),
        Settings(seed=1234, season="sommer", weather_mode="auto", behaviour="homeoffice"),
        Settings(seed=7, season="herbst", weather_mode="regen", adults=1, children=0),
    ],
)
def test_same_inputs_give_identical_state(
    settings: Settings, connections: list[sqlite3.Connection]
) -> None:
    first = _new_sim(settings, connections)
    second = _new_sim(settings, connections)
    _run_script(first)
    _run_script(second)
    assert _state_json(first) == _state_json(second)
    assert first.rng.random() == second.rng.random()


def test_reset_then_rerun_reproduces_the_first_run(connections: list[sqlite3.Connection]) -> None:
    sim = _new_sim(Settings(seed=2024), connections)
    _run_script(sim)
    first_run = _state_json(sim)

    sim.reset()
    _run_script(sim)
    assert _state_json(sim) == first_run


def test_reset_restores_start_time_and_default_devices(
    connections: list[sqlite3.Connection],
) -> None:
    settings = Settings(seed=3)
    sim = _new_sim(settings, connections)
    _run_script(sim)
    assert sim.state.clock.sim_time > settings.start_time

    sim.reset()
    initial = build_initial_state(settings)
    assert sim.state.clock.sim_time == settings.start_time
    assert [d.model_dump() for d in sim.state.devices] == [d.model_dump() for d in initial.devices]
    assert sim.state.clock.paused is False
