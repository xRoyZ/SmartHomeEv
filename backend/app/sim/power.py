"""Power consumption of the devices and the house balance against solar.

Every device's ``power_w`` follows from its state: a light draws in proportion to its
brightness, a plug its ``rated_w`` while on, an appliance a share of its ``rated_w``
that depends on its program and the phase of a repeating program profile, and the
fridge cycles its compressor. Thermostats (hot-water radiators), shutters and windows
draw nothing. The house consumption is the sum of all devices plus the base load and
the extra load events add; ``production_w`` is left to the environment module.

Deterministic: the profiles depend on simulation time only.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.sim.state import ApplianceDevice, LightDevice, PlugDevice

if TYPE_CHECKING:
    from datetime import datetime

    from app.engine import Simulation

# A light at full brightness (LED fixture).
LIGHT_MAX_W = 60.0

# Fridge compressor: on for the first part of every cycle, standby otherwise.
FRIDGE_ID = "kueche.kuehlschrank"
FRIDGE_CYCLE_MIN = 40
FRIDGE_RUN_MIN = 15
FRIDGE_STANDBY_W = 5.0

# Share of rated_w per program: a list of (minutes, share) phases repeated over time.
PROGRAM_PROFILES: dict[str, list[tuple[int, float]]] = {
    # Washing machine: heat the water, then wash/rinse, then spin.
    "Baumwolle 40 °C": [(15, 1.0), (30, 0.15), (10, 0.3)],
    "Pflegeleicht 30 °C": [(10, 0.8), (25, 0.12), (8, 0.25)],
    "Kurz 20 °C": [(5, 0.5), (15, 0.1), (5, 0.25)],
    # Dishwasher.
    "Eco 50 °C": [(15, 0.7), (40, 0.05), (10, 0.6)],
    "Intensiv 70 °C": [(20, 1.0), (30, 0.08), (15, 0.9)],
    "Kurz 45 °C": [(10, 0.8), (15, 0.06), (8, 0.7)],
    # Oven: the heating element cycles to hold the temperature.
    "Umluft 180 °C": [(6, 0.85), (4, 0.4)],
    "Ober-/Unterhitze 200 °C": [(7, 1.0), (3, 0.45)],
    "Grill": [(8, 1.0), (2, 0.6)],
    # Coffee machine: heat up, then keep warm.
    "Kaffee": [(2, 0.9), (8, 0.15)],
    "Espresso": [(1, 1.0), (4, 0.2)],
    "Cappuccino": [(3, 1.0), (7, 0.25)],
}
# Share of rated_w for an appliance that is on without a (known) program.
DEFAULT_APPLIANCE_SHARE = 0.8


def _minutes(now: datetime) -> int:
    """Whole simulated minutes since midnight of the day ordinal (monotonic over time)."""
    return now.toordinal() * 1440 + now.hour * 60 + now.minute


def profile_share(program: str | None, now: datetime) -> float:
    """The share of rated power an appliance running ``program`` draws at ``now``."""
    profile = PROGRAM_PROFILES.get(program or "")
    if not profile:
        return DEFAULT_APPLIANCE_SHARE
    period = sum(minutes for minutes, _ in profile)
    position = _minutes(now) % period
    for minutes, share in profile:
        if position < minutes:
            return share
        position -= minutes
    return profile[-1][1]


def fridge_power(rated_w: float, now: datetime) -> float:
    """Fridge draw: compressor at ``rated_w`` during its run phase, standby otherwise."""
    if _minutes(now) % FRIDGE_CYCLE_MIN < FRIDGE_RUN_MIN:
        return rated_w
    return FRIDGE_STANDBY_W


def device_power(device: object, now: datetime) -> float:
    """The power a device draws in its current state, in watts."""
    if isinstance(device, LightDevice):
        return LIGHT_MAX_W * device.brightness / 100.0 if device.on else 0.0
    if isinstance(device, PlugDevice):
        return device.rated_w if device.on else 0.0
    if isinstance(device, ApplianceDevice):
        if not device.on:
            return 0.0
        if device.id == FRIDGE_ID:
            return fridge_power(device.rated_w, now)
        return device.rated_w * profile_share(device.program, now)
    return 0.0


def step(sim: Simulation, dt_s: float) -> None:
    """Recompute every device's power and the house consumption and balance."""
    state = sim.state
    now = state.clock.sim_time
    total = 0.0
    for device in state.devices:
        device.power_w = round(device_power(device, now), 1)
        total += device.power_w
    consumption = total + state.base_load_w + state.extra_load_w
    state.solar.consumption_w = round(consumption, 1)
    state.solar.balance_w = round(state.solar.production_w - state.solar.consumption_w, 1)
