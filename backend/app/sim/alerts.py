"""Alerts raised from the configured thresholds and sensor states.

Every substep evaluates each AlertKind against ``state`` and ``state.thresholds``:
a condition that holds raises (or keeps) its alert, one that no longer holds resolves
it. Threshold alerts resolve with a small hysteresis so a value hovering at the limit
does not flap; an alert raised again after it resolved starts unacknowledged
(``raise_alert`` takes care of that).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.sim.state import (
    AlertKind,
    Room,
    RoomId,
    SimState,
    ThermostatDevice,
    WindowDevice,
    make_alert_id,
    raise_alert,
    resolve_alert,
)

if TYPE_CHECKING:
    from datetime import datetime

    from app.engine import Simulation

# The separator between value and place in alert messages (en dash, as in the design).
_DASH = "\u2013"

# How far a value must come back inside its limit before an active alert resolves.
TEMPERATURE_HYSTERESIS_C = 0.2
CO2_HYSTERESIS_PPM = 50.0
POWER_HYSTERESIS_W = 100.0


def _de_number(value: float, decimals: int) -> str:
    """German number formatting: ``1.420`` / ``16,8``."""
    text = f"{value:,.{decimals}f}"
    return text.replace(",", "_").replace(".", ",").replace("_", ".")


def _is_active(state: SimState, alert_id: str) -> bool:
    return any(alert.id == alert_id and alert.active for alert in state.alerts)


def _apply(
    state: SimState,
    kind: AlertKind,
    room_id: RoomId | None,
    *,
    triggered: bool,
    still_triggered: bool,
    message: str,
    severity: str,
    now: datetime,
) -> None:
    """Raise/keep the alert while its condition holds, resolve it once it does not.

    ``triggered`` raises a new alert; an already active one stays active while
    ``still_triggered`` holds (the hysteresis band).
    """
    alert_id = make_alert_id(kind, room_id)
    active = _is_active(state, alert_id)
    if triggered or (active and still_triggered):
        raise_alert(state, kind, room_id, message, severity, now)
    elif active:
        resolve_alert(state, alert_id)


def _evaluate_climate(state: SimState, room: Room, now: datetime) -> None:
    """zu_kalt, zu_warm and co2_hoch of one room against the thresholds."""
    limits = state.thresholds
    temp = room.temperature_c
    _apply(
        state,
        "zu_kalt",
        room.id,
        triggered=temp < limits.room_min_c,
        still_triggered=temp < limits.room_min_c + TEMPERATURE_HYSTERESIS_C,
        message=(
            f"Raumtemperatur {_de_number(temp, 1)}° {_DASH} {room.name}"
            f" (unter dem Minimum von {_de_number(limits.room_min_c, 1)}°)"
        ),
        severity="warnung",
        now=now,
    )
    _apply(
        state,
        "zu_warm",
        room.id,
        triggered=temp > limits.room_max_c,
        still_triggered=temp > limits.room_max_c - TEMPERATURE_HYSTERESIS_C,
        message=(
            f"Raumtemperatur {_de_number(temp, 1)}° {_DASH} {room.name}"
            f" (über dem Maximum von {_de_number(limits.room_max_c, 1)}°)"
        ),
        severity="warnung",
        now=now,
    )
    co2 = room.co2_ppm
    _apply(
        state,
        "co2_hoch",
        room.id,
        triggered=co2 > limits.co2_max_ppm,
        still_triggered=co2 > limits.co2_max_ppm - CO2_HYSTERESIS_PPM,
        message=(
            f"CO2 {_de_number(co2, 0)} ppm {_DASH} {room.name}"
            f" (Grenze {_de_number(limits.co2_max_ppm, 0)} ppm überschritten)"
        ),
        severity="warnung",
        now=now,
    )


def _evaluate_sensors(state: SimState, room: Room, now: datetime) -> None:
    """rauch and wasser of one room (rooms without such a sensor report None)."""
    _apply(
        state,
        "rauch",
        room.id,
        triggered=room.smoke is True,
        still_triggered=room.smoke is True,
        message=f"Rauch erkannt {_DASH} {room.name}",
        severity="kritisch",
        now=now,
    )
    _apply(
        state,
        "wasser",
        room.id,
        triggered=room.leak is True,
        still_triggered=room.leak is True,
        message=f"Wasser erkannt {_DASH} {room.name}",
        severity="kritisch",
        now=now,
    )


def _evaluate_heating(
    state: SimState,
    room: Room,
    thermostat: ThermostatDevice | None,
    window_open: bool,
    now: datetime,
) -> None:
    """fenster_heizung and heizungsausfall of one room."""
    heating_with_open_window = thermostat is not None and thermostat.heating and window_open
    _apply(
        state,
        "fenster_heizung",
        room.id,
        triggered=heating_with_open_window,
        still_triggered=heating_with_open_window,
        message=f"Fenster offen bei Heizung {_DASH} {room.name}",
        severity="warnung",
        now=now,
    )
    failed = thermostat is not None and thermostat.failed
    _apply(
        state,
        "heizungsausfall",
        room.id,
        triggered=failed,
        still_triggered=failed,
        message=f"Heizungsausfall {_DASH} {room.name}",
        severity="kritisch",
        now=now,
    )


def _evaluate_power(state: SimState, now: datetime) -> None:
    """verbrauch_hoch of the whole house."""
    limits = state.thresholds
    consumption = state.solar.consumption_w
    _apply(
        state,
        "verbrauch_hoch",
        None,
        triggered=consumption > limits.power_max_w,
        still_triggered=consumption > limits.power_max_w - POWER_HYSTERESIS_W,
        message=(
            f"Stromverbrauch {_de_number(consumption, 0)} W {_DASH} Haus"
            f" (Grenze {_de_number(limits.power_max_w, 0)} W überschritten)"
        ),
        severity="warnung",
        now=now,
    )


def evaluate(state: SimState) -> None:
    """Evaluate every alert kind against the current state and thresholds."""
    now = state.clock.sim_time
    thermostats = {d.room_id: d for d in state.devices if isinstance(d, ThermostatDevice)}
    windows_open = {d.room_id for d in state.devices if isinstance(d, WindowDevice) and d.open}
    for room in state.rooms:
        _evaluate_climate(state, room, now)
        _evaluate_sensors(state, room, now)
        _evaluate_heating(state, room, thermostats.get(room.id), room.id in windows_open, now)
    _evaluate_power(state, now)


def step(sim: Simulation, dt_s: float) -> None:
    """Advance this part of the simulation by ``dt_s`` simulated seconds."""
    evaluate(sim.state)
