"""Tests of device power and the house consumption."""

from __future__ import annotations

from datetime import datetime

from app.engine import Simulation
from app.sim import power
from app.sim.state import ApplianceDevice


def _device(sim: Simulation, device_id: str):
    return next(d for d in sim.state.devices if d.id == device_id)


def test_backofen_on_raises_consumption(sim: Simulation) -> None:
    power.step(sim, 60.0)
    before = sim.state.solar.consumption_w
    oven = _device(sim, "kueche.backofen")
    oven.on = True
    oven.program = "Umluft 180 °C"
    power.step(sim, 60.0)
    assert oven.power_w > 500.0
    assert sim.state.solar.consumption_w > before + 500.0


def test_consumption_equals_devices_plus_base_and_extra_load(sim: Simulation) -> None:
    _device(sim, "wohnzimmer.tv").on = True
    _device(sim, "kueche.licht").on = True
    sim.state.extra_load_w = 250.0
    sim.state.solar.production_w = 1000.0
    power.step(sim, 60.0)
    devices = sum(d.power_w for d in sim.state.devices)
    expected = devices + sim.state.base_load_w + sim.state.extra_load_w
    assert abs(sim.state.solar.consumption_w - expected) < 0.5
    assert abs(sim.state.solar.balance_w - (1000.0 - sim.state.solar.consumption_w)) < 0.5


def test_off_devices_draw_nothing(sim: Simulation) -> None:
    for device in sim.state.devices:
        if hasattr(device, "on"):
            device.on = False
    power.step(sim, 60.0)
    assert all(d.power_w == 0.0 for d in sim.state.devices)
    assert abs(sim.state.solar.consumption_w - sim.state.base_load_w) < 0.5


def test_light_power_scales_with_brightness(sim: Simulation) -> None:
    light = _device(sim, "bad.licht")
    light.on = True
    light.brightness = 100
    power.step(sim, 60.0)
    full = light.power_w
    light.brightness = 25
    power.step(sim, 60.0)
    assert 0.0 < light.power_w < full


def test_plug_draws_rated_power_when_on(sim: Simulation) -> None:
    tv = _device(sim, "wohnzimmer.tv")
    tv.on = True
    power.step(sim, 60.0)
    assert tv.power_w == tv.rated_w


def test_fridge_cycles_between_compressor_and_standby() -> None:
    day = datetime(2026, 1, 15)
    values = {power.fridge_power(150.0, day.replace(hour=10, minute=m)) for m in range(60)}
    assert 150.0 in values
    assert power.FRIDGE_STANDBY_W in values


def test_program_changes_appliance_draw() -> None:
    moment = datetime(2026, 1, 15, 12, 0)
    machine = ApplianceDevice(
        id="bad.waschmaschine",
        room_id="bad",
        name="Waschmaschine",
        on=True,
        programs=["Baumwolle 40 °C", "Kurz 20 °C"],
        program="Baumwolle 40 °C",
        rated_w=2000.0,
    )
    daily = [
        power.device_power(machine, moment.replace(hour=h, minute=m))
        for h in range(2)
        for m in range(60)
    ]
    machine.program = "Kurz 20 °C"
    short = [
        power.device_power(machine, moment.replace(hour=h, minute=m))
        for h in range(2)
        for m in range(60)
    ]
    assert max(daily) > max(short)
    assert min(daily) < max(daily)


def test_state_endpoint_reports_backofen_consumption(client) -> None:
    sim = client.app.state.sim
    before = client.get("/api/state").json()["solar"]["consumption_w"]
    oven = _device(sim, "kueche.backofen")
    oven.on = True
    oven.program = "Ober-/Unterhitze 200 °C"
    sim.advance(60.0)
    after = client.get("/api/state").json()["solar"]["consumption_w"]
    assert after > before + 500.0
