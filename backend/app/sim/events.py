"""Triggerable events (Fenster vergessen, Wasserschaden, Rauch, Stromspitze, Heizungsausfall).

``trigger`` applies an event's effect to the state at once, raises the matching alert
and logs it with source ``ereignis``. Timed events (smoke, power spike, heating
failure) carry an ``ends_at`` and are reverted by ``step`` when it passes; a water
leak stays until the next reset, and a forgotten window stays open until somebody
closes it.
"""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from app.sim.state import (
    ROOM_NAMES,
    ActiveEvent,
    EventType,
    Room,
    RoomId,
    ThermostatDevice,
    WindowDevice,
    make_alert_id,
    raise_alert,
    resolve_alert,
)

if TYPE_CHECKING:
    from app.engine import Simulation

# How long the timed events last, in simulated time.
SMOKE_DURATION = timedelta(minutes=30)
POWER_SPIKE_DURATION = timedelta(minutes=15)
HEATING_FAILURE_DURATION = timedelta(hours=2)

# The additional load a power spike puts on the house (above the default 6000 W limit).
POWER_SPIKE_W = 7500.0

LEAK_ROOMS: tuple[RoomId, ...] = ("bad", "kueche")


def _room(sim: Simulation, room_id: str) -> Room:
    return next(room for room in sim.state.rooms if room.id == room_id)


def _window(sim: Simulation, room_id: str) -> WindowDevice | None:
    for device in sim.state.devices:
        if isinstance(device, WindowDevice) and device.room_id == room_id:
            return device
    return None


def _thermostats(sim: Simulation) -> list[ThermostatDevice]:
    return [d for d in sim.state.devices if isinstance(d, ThermostatDevice)]


def _drop_events(sim: Simulation, type: EventType, room_id: str | None = None) -> None:
    """Remove active events of ``type`` (in ``room_id`` if given); a re-trigger replaces them."""
    sim.state.active_events = [
        event
        for event in sim.state.active_events
        if not (event.type == type and (room_id is None or event.room_id == room_id))
    ]


def _set_extra_load(sim: Simulation, extra_w: float) -> None:
    """Set the event load and show it in the energy balance right away.

    The power module recomputes consumption from ``extra_load_w`` on its next step;
    adjusting the figures here only makes the change visible without waiting for it.
    """
    solar = sim.state.solar
    solar.consumption_w = round(solar.consumption_w - sim.state.extra_load_w + extra_w, 1)
    solar.balance_w = round(solar.production_w - solar.consumption_w, 1)
    sim.state.extra_load_w = extra_w


# --------------------------------------------------------------------------- triggers


def _trigger_window(sim: Simulation) -> ActiveEvent:
    thermostats = {t.room_id: t for t in _thermostats(sim)}
    closed = [
        room_id
        for room_id in ROOM_NAMES
        if (window := _window(sim, room_id)) is not None and not window.open
    ]
    heated = [room_id for room_id in closed if thermostats[room_id].heating]
    candidates = heated or closed or list(ROOM_NAMES)
    room_id: RoomId = sim.rng.choice(candidates)
    window = _window(sim, room_id)
    if window is not None:
        window.open = True
    _drop_events(sim, "fenster_vergessen", room_id)
    name = ROOM_NAMES[room_id]
    raise_alert(
        sim.state,
        "fenster_heizung",
        room_id,
        f"Fenster im Raum {name} ist offen, während die Heizung läuft.",
        "warnung",
        sim.state.clock.sim_time,
    )
    sim.log(f"Ereignis: Fenster im Raum {name} wurde offen vergessen.", "ereignis")
    return ActiveEvent(
        type="fenster_vergessen", room_id=room_id, started_at=sim.state.clock.sim_time
    )


def _trigger_leak(sim: Simulation) -> ActiveEvent:
    room_id: RoomId = sim.rng.choice(LEAK_ROOMS)
    _room(sim, room_id).leak = True
    _drop_events(sim, "wasserschaden", room_id)
    name = ROOM_NAMES[room_id]
    raise_alert(
        sim.state,
        "wasser",
        room_id,
        f"Wassermelder im Raum {name} meldet Wasser: Wasserschaden!",
        "kritisch",
        sim.state.clock.sim_time,
    )
    sim.log(f"Ereignis: Wasserschaden im Raum {name}.", "ereignis")
    return ActiveEvent(type="wasserschaden", room_id=room_id, started_at=sim.state.clock.sim_time)


def _trigger_smoke(sim: Simulation) -> ActiveEvent:
    now = sim.state.clock.sim_time
    _room(sim, "kueche").smoke = True
    _drop_events(sim, "rauch_kueche")
    raise_alert(
        sim.state,
        "rauch",
        "kueche",
        "Rauchmelder in der Küche hat Rauch erkannt!",
        "kritisch",
        now,
    )
    sim.log("Ereignis: Rauch in der Küche.", "ereignis")
    return ActiveEvent(
        type="rauch_kueche", room_id="kueche", started_at=now, ends_at=now + SMOKE_DURATION
    )


def _trigger_power_spike(sim: Simulation) -> ActiveEvent:
    now = sim.state.clock.sim_time
    _set_extra_load(sim, POWER_SPIKE_W)
    _drop_events(sim, "stromspitze")
    raise_alert(
        sim.state,
        "verbrauch_hoch",
        None,
        f"Stromspitze: zusätzlich {POWER_SPIKE_W:.0f} W Verbrauch im Haus.",
        "warnung",
        now,
    )
    sim.log(f"Ereignis: Stromspitze von {POWER_SPIKE_W:.0f} W.", "ereignis")
    return ActiveEvent(
        type="stromspitze", room_id=None, started_at=now, ends_at=now + POWER_SPIKE_DURATION
    )


def _trigger_heating_failure(sim: Simulation) -> ActiveEvent:
    now = sim.state.clock.sim_time
    for thermostat in _thermostats(sim):
        thermostat.failed = True
        thermostat.heating = False
        thermostat.power_w = 0.0
    _drop_events(sim, "heizungsausfall")
    raise_alert(
        sim.state,
        "heizungsausfall",
        None,
        "Die Heizung ist ausgefallen, keine Raumheizung aktiv.",
        "kritisch",
        now,
    )
    sim.log("Ereignis: Heizungsausfall im ganzen Haus.", "ereignis")
    return ActiveEvent(
        type="heizungsausfall", room_id=None, started_at=now, ends_at=now + HEATING_FAILURE_DURATION
    )


_TRIGGERS = {
    "fenster_vergessen": _trigger_window,
    "wasserschaden": _trigger_leak,
    "rauch_kueche": _trigger_smoke,
    "stromspitze": _trigger_power_spike,
    "heizungsausfall": _trigger_heating_failure,
}


def trigger(sim: Simulation, type: EventType) -> ActiveEvent:
    """Start an event of ``type`` and return it as it appears in ``state.active_events``."""
    try:
        start = _TRIGGERS[type]
    except KeyError:
        raise ValueError(f"unknown event type {type!r}") from None
    event = start(sim)
    sim.state.active_events.append(event)
    return event


# --------------------------------------------------------------------------- ending


def _end(sim: Simulation, event: ActiveEvent) -> None:
    """Revert the effect of a timed event that has run out."""
    if event.type == "rauch_kueche":
        _room(sim, "kueche").smoke = False
        resolve_alert(sim.state, make_alert_id("rauch", "kueche"))
        sim.log("Ereignis beendet: Kein Rauch mehr in der Küche.", "ereignis")
    elif event.type == "stromspitze":
        _set_extra_load(sim, 0.0)
        resolve_alert(sim.state, make_alert_id("verbrauch_hoch", None))
        sim.log("Ereignis beendet: Die Stromspitze ist vorbei.", "ereignis")
    elif event.type == "heizungsausfall":
        for thermostat in _thermostats(sim):
            thermostat.failed = False
        resolve_alert(sim.state, make_alert_id("heizungsausfall", None))
        sim.log("Ereignis beendet: Die Heizung läuft wieder.", "ereignis")


def step(sim: Simulation, dt_s: float) -> None:
    """End timed events whose ``ends_at`` has passed and forgotten windows that were closed."""
    now = sim.state.clock.sim_time
    remaining: list[ActiveEvent] = []
    for event in sim.state.active_events:
        if event.ends_at is not None and now >= event.ends_at:
            _end(sim, event)
            continue
        if event.type == "fenster_vergessen" and event.room_id is not None:
            window = _window(sim, event.room_id)
            if window is None or not window.open:
                resolve_alert(sim.state, make_alert_id("fenster_heizung", event.room_id))
                continue
        remaining.append(event)
    sim.state.active_events = remaining
