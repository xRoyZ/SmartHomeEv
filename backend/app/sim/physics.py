"""Room physics: temperature, humidity, CO2 and light.

Every room relaxes toward its surroundings with a time constant; an open window
shortens those time constants drastically. Heating pushes a room toward its
thermostat target, occupants add CO2, showering and cooking add humidity, and the
light level follows daylight through the shutter plus the room light.

Deterministic: no randomness, only the current state and ``dt_s``.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from app.sim.state import (
    ApplianceDevice,
    LightDevice,
    Room,
    ShutterDevice,
    ThermostatDevice,
    WindowDevice,
)

if TYPE_CHECKING:
    from app.engine import Simulation

# --- temperature -------------------------------------------------------------------
# Time constant (hours) of the exchange with the outdoor temperature.
TEMP_TAU_CLOSED_H = 30.0
TEMP_TAU_OPEN_H = 0.75
# How fast a heating radiator warms the room (°C per hour, before losses).
HEATING_RATE_C_PER_H = 2.5
# Extra heat (°C per hour) from cooking and a running oven in the kitchen.
COOKING_HEAT_C_PER_H = 0.6
OVEN_HEAT_C_PER_H = 1.0
# Solar gain through an open shutter at full daylight (°C per hour).
SOLAR_GAIN_C_PER_H = 0.4

# --- humidity ----------------------------------------------------------------------
HUMIDITY_BASE_PCT = 45.0
HUMIDITY_TAU_CLOSED_H = 2.0
HUMIDITY_TAU_OPEN_H = 0.4
SHOWER_HUMIDITY_PCT_PER_H = 60.0
COOKING_HUMIDITY_PCT_PER_H = 15.0
HUMIDITY_MIN_PCT = 20.0
HUMIDITY_MAX_PCT = 99.0

# --- CO2 ---------------------------------------------------------------------------
OUTDOOR_CO2_PPM = 420.0
CO2_PER_OCCUPANT_PPM_PER_H = 350.0
CO2_TAU_CLOSED_H = 2.0
CO2_TAU_OPEN_H = 0.15
CO2_MAX_PPM = 5000.0

# --- light -------------------------------------------------------------------------
DAYLIGHT_LUX = {"flur": 120.0}
DAYLIGHT_LUX_DEFAULT = 400.0
LAMP_LUX = 300.0


def _relax(value: float, target: float, tau_h: float, dt_s: float) -> float:
    """Move ``value`` toward ``target`` exponentially with time constant ``tau_h``."""
    factor = 1.0 - math.exp(-dt_s / (tau_h * 3600.0))
    return value + (target - value) * factor


def _devices_of_room(sim: Simulation, room_id: str) -> dict[str, object]:
    found: dict[str, object] = {}
    for device in sim.state.devices:
        if device.room_id != room_id:
            continue
        if isinstance(device, ThermostatDevice):
            found["thermostat"] = device
        elif isinstance(device, WindowDevice):
            found["window"] = device
        elif isinstance(device, ShutterDevice):
            found["shutter"] = device
        elif isinstance(device, LightDevice):
            found["light"] = device
    return found


def _oven_on(sim: Simulation) -> bool:
    return any(
        isinstance(d, ApplianceDevice) and d.id == "kueche.backofen" and d.on
        for d in sim.state.devices
    )


def _step_temperature(
    sim: Simulation,
    room: Room,
    thermostat: ThermostatDevice | None,
    window_open: bool,
    openness: float,
    dt_s: float,
) -> None:
    outdoor_c = sim.state.outdoor.temperature_c
    dt_h = dt_s / 3600.0
    tau = TEMP_TAU_OPEN_H if window_open else TEMP_TAU_CLOSED_H
    temperature = _relax(room.temperature_c, outdoor_c, tau, dt_s)

    gain = SOLAR_GAIN_C_PER_H * sim.state.outdoor.daylight * openness
    if room.id == "kueche":
        if room.activity == "kochen":
            gain += COOKING_HEAT_C_PER_H
        if _oven_on(sim):
            gain += OVEN_HEAT_C_PER_H
    temperature += gain * dt_h

    if thermostat is not None:
        heating = not thermostat.failed and room.temperature_c < thermostat.target_c
        if heating:
            heated = temperature + HEATING_RATE_C_PER_H * dt_h
            # The radiator stops at the target; losses may still keep the room below it.
            temperature = max(temperature, min(heated, thermostat.target_c))
    room.temperature_c = round(temperature, 3)
    if thermostat is not None:
        thermostat.heating = not thermostat.failed and room.temperature_c < thermostat.target_c


def _step_humidity(room: Room, window_open: bool, dt_s: float) -> None:
    tau = HUMIDITY_TAU_OPEN_H if window_open else HUMIDITY_TAU_CLOSED_H
    humidity = _relax(room.humidity_pct, HUMIDITY_BASE_PCT, tau, dt_s)
    if room.id == "bad" and room.activity == "duschen":
        humidity += SHOWER_HUMIDITY_PCT_PER_H * dt_s / 3600.0
    elif room.id == "kueche" and room.activity == "kochen":
        humidity += COOKING_HUMIDITY_PCT_PER_H * dt_s / 3600.0
    room.humidity_pct = round(min(HUMIDITY_MAX_PCT, max(HUMIDITY_MIN_PCT, humidity)), 3)


def _step_co2(room: Room, occupants: int, window_open: bool, dt_s: float) -> None:
    tau = CO2_TAU_OPEN_H if window_open else CO2_TAU_CLOSED_H
    co2 = _relax(room.co2_ppm, OUTDOOR_CO2_PPM, tau, dt_s)
    co2 += occupants * CO2_PER_OCCUPANT_PPM_PER_H * dt_s / 3600.0
    room.co2_ppm = round(min(CO2_MAX_PPM, max(OUTDOOR_CO2_PPM, co2)), 2)


def _light_lux(sim: Simulation, room: Room, light: LightDevice | None, openness: float) -> float:
    window_lux = DAYLIGHT_LUX.get(room.id, DAYLIGHT_LUX_DEFAULT)
    lux = sim.state.outdoor.daylight * window_lux * openness
    if light is not None and light.on:
        lux += LAMP_LUX * light.brightness / 100.0
    return round(max(0.0, lux), 1)


def step(sim: Simulation, dt_s: float) -> None:
    """Advance temperature, humidity, CO2 and light of every room by ``dt_s`` seconds."""
    if dt_s <= 0:
        return
    occupants: dict[str, int] = {}
    for resident in sim.state.residents:
        if resident.room_id is not None:
            occupants[resident.room_id] = occupants.get(resident.room_id, 0) + 1

    for room in sim.state.rooms:
        devices = _devices_of_room(sim, room.id)
        window = devices.get("window")
        shutter = devices.get("shutter")
        thermostat = devices.get("thermostat")
        light = devices.get("light")
        window_open = isinstance(window, WindowDevice) and window.open
        openness = 1.0 - shutter.position / 100.0 if isinstance(shutter, ShutterDevice) else 1.0

        _step_temperature(
            sim,
            room,
            thermostat if isinstance(thermostat, ThermostatDevice) else None,
            window_open,
            openness,
            dt_s,
        )
        _step_humidity(room, window_open, dt_s)
        _step_co2(room, occupants.get(room.id, 0), window_open, dt_s)
        room.light_lux = _light_lux(
            sim, room, light if isinstance(light, LightDevice) else None, openness
        )
