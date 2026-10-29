"""Tests of the room physics: temperature, humidity, CO2 and light."""

from __future__ import annotations

from app.engine import Simulation
from app.sim import physics


def _room(sim: Simulation, room_id: str):
    return next(r for r in sim.state.rooms if r.id == room_id)


def _device(sim: Simulation, device_id: str):
    return next(d for d in sim.state.devices if d.id == device_id)


def _run(sim: Simulation, hours: float, step_s: float = 60.0) -> None:
    for _ in range(int(hours * 3600 / step_s)):
        physics.step(sim, step_s)


def test_open_window_cools_heated_room(sim: Simulation) -> None:
    sim.state.outdoor.temperature_c = 0.0
    room = _room(sim, "wohnzimmer")
    room.temperature_c = 21.0
    _device(sim, "wohnzimmer.heizung").target_c = 21.0
    _device(sim, "wohnzimmer.fenster").open = True
    _run(sim, 1.0)
    assert room.temperature_c < 18.0


def test_open_window_cools_faster_than_closed(sim: Simulation) -> None:
    sim.state.outdoor.temperature_c = 0.0
    for room_id in ("wohnzimmer", "kinderzimmer"):
        _room(sim, room_id).temperature_c = 20.0
        _device(sim, f"{room_id}.heizung").failed = True
    _device(sim, "wohnzimmer.fenster").open = True
    _run(sim, 0.5)
    assert _room(sim, "wohnzimmer").temperature_c < _room(sim, "kinderzimmer").temperature_c - 2


def test_heating_raises_temperature_to_target(sim: Simulation) -> None:
    sim.state.outdoor.temperature_c = 0.0
    room = _room(sim, "schlafzimmer")
    room.temperature_c = 15.0
    thermostat = _device(sim, "schlafzimmer.heizung")
    thermostat.target_c = 20.0
    physics.step(sim, 60.0)
    assert thermostat.heating is True
    _run(sim, 6.0)
    assert abs(room.temperature_c - 20.0) < 0.3
    assert room.temperature_c <= 20.0 + 1e-6


def test_failed_heating_does_not_heat(sim: Simulation) -> None:
    sim.state.outdoor.temperature_c = 0.0
    room = _room(sim, "flur")
    room.temperature_c = 15.0
    thermostat = _device(sim, "flur.heizung")
    thermostat.failed = True
    _run(sim, 2.0)
    assert thermostat.heating is False
    assert room.temperature_c < 15.0


def test_co2_rises_with_occupants(sim: Simulation) -> None:
    for resident in sim.state.residents:
        resident.room_id = "wohnzimmer"
    room = _room(sim, "wohnzimmer")
    empty = _room(sim, "flur")
    room.co2_ppm = 600.0
    empty.co2_ppm = 600.0
    _run(sim, 1.0)
    assert room.co2_ppm > 800.0
    assert empty.co2_ppm < 600.0


def test_open_window_vents_co2(sim: Simulation) -> None:
    room = _room(sim, "kinderzimmer")
    room.co2_ppm = 2000.0
    for resident in sim.state.residents:
        resident.room_id = None
    _device(sim, "kinderzimmer.fenster").open = True
    _run(sim, 0.5)
    assert room.co2_ppm < 600.0


def test_shower_raises_humidity_and_it_relaxes_afterwards(sim: Simulation) -> None:
    bad = _room(sim, "bad")
    bad.humidity_pct = 50.0
    bad.activity = "duschen"
    _run(sim, 0.25)
    peak = bad.humidity_pct
    assert peak > 55.0
    bad.activity = "none"
    _run(sim, 2.0)
    assert bad.humidity_pct < peak


def test_light_follows_daylight_shutter_and_lamp(sim: Simulation) -> None:
    sim.state.outdoor.daylight = 0.0
    room = _room(sim, "wohnzimmer")
    light = _device(sim, "wohnzimmer.licht")
    light.on = False
    physics.step(sim, 60.0)
    assert room.light_lux == 0.0
    light.on = True
    light.brightness = 50
    physics.step(sim, 60.0)
    dim = room.light_lux
    assert dim > 0.0
    light.on = False
    sim.state.outdoor.daylight = 1.0
    _device(sim, "wohnzimmer.rollladen").position = 0
    physics.step(sim, 60.0)
    open_lux = room.light_lux
    _device(sim, "wohnzimmer.rollladen").position = 100
    physics.step(sim, 60.0)
    assert room.light_lux < open_lux
    assert room.light_lux == 0.0


def test_advance_keeps_values_finite_over_a_day(sim: Simulation) -> None:
    sim.advance(24 * 3600)
    for room in sim.state.rooms:
        assert -30.0 < room.temperature_c < 45.0
        assert 0.0 <= room.humidity_pct <= 100.0
        assert room.co2_ppm >= 400.0
        assert room.light_lux >= 0.0
