"""The automations engine: evaluates conditions and fires actions.

An enabled automation fires on the RISING EDGE of its condition: the step in which the
condition turns from false to true. A ``time`` condition fires when the simulation clock
crosses its ``at`` time. Firing applies ``Action.set`` to the target device, stamps
``last_fired_at`` and adds an ``automation`` entry to the activity log.

The last seen value of every condition is kept per simulation outside the shared state
(it is engine bookkeeping, not part of the contract). An automation the engine has not
seen yet — just created, edited or re-enabled — starts from "false", so it fires as soon
as its condition is true. :func:`prime` records the current values without firing; the
store calls it after loading or resetting, so a restart does not replay every rule.
"""

from __future__ import annotations

import logging
import weakref
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from app.sim.state import (
    ROOM_NAMES,
    Action,
    ApplianceDevice,
    Automation,
    AutomationIn,
    ContactCondition,
    DeviceUpdate,
    LightDevice,
    MotionCondition,
    PlugDevice,
    SensorCondition,
    ShutterDevice,
    SimState,
    SunCondition,
    ThermostatDevice,
    TimeCondition,
    WindowDevice,
)

if TYPE_CHECKING:
    from app.engine import Simulation

logger = logging.getLogger(__name__)

# Which DeviceUpdate fields each device kind accepts (same rule as the device endpoint).
APPLICABLE_FIELDS: dict[str, frozenset[str]] = {
    "thermostat": frozenset({"target_c"}),
    "light": frozenset({"on", "brightness"}),
    "shutter": frozenset({"position"}),
    "window": frozenset({"open"}),
    "plug": frozenset({"on"}),
    "appliance": frozenset({"on", "program"}),
}

# Last evaluated condition value per simulation and automation id.
_last_values: weakref.WeakKeyDictionary[Simulation, dict[int, bool]] = weakref.WeakKeyDictionary()


# --------------------------------------------------------------------------- defaults


def default_automations() -> list[AutomationIn]:
    """The automations a fresh or reset simulation starts with."""
    return [
        AutomationIn.model_validate(
            {
                "name": "Heizung aus, wenn Fenster offen",
                "enabled": True,
                "condition": {"type": "contact", "device_id": "schlafzimmer.fenster", "open": True},
                # 5 °C is the lowest target: frost protection, the heating stays off.
                "action": {"device_id": "schlafzimmer.heizung", "set": {"target_c": 5}},
            }
        ),
        AutomationIn.model_validate(
            {
                "name": "Rollläden runter bei Sonnenuntergang",
                "enabled": True,
                "condition": {"type": "sun", "state": "down"},
                # position 100 = fully closed.
                "action": {"device_id": "wohnzimmer.rollladen", "set": {"position": 100}},
            }
        ),
        AutomationIn.model_validate(
            {
                "name": "Licht aus, wenn 10 Minuten keine Bewegung",
                "enabled": True,
                "condition": {
                    "type": "motion",
                    "room_id": "flur",
                    "detected": False,
                    "minutes": 10,
                },
                "action": {"device_id": "flur.licht", "set": {"on": False}},
            }
        ),
    ]


# --------------------------------------------------------------------------- actions


def set_fields(update: DeviceUpdate) -> dict[str, object]:
    """The fields an update really sets. ``null`` counts as "not set" for every field."""
    return {
        name: getattr(update, name)
        for name in DeviceUpdate.model_fields
        if getattr(update, name) is not None
    }


def find_device(state: SimState, device_id: str) -> object | None:
    for device in state.devices:
        if device.id == device_id:
            return device
    return None


def validate_action(state: SimState, action: Action) -> str | None:
    """Why ``action`` cannot be applied to its device, or None when it can."""
    device = find_device(state, action.device_id)
    if device is None:
        return f"unknown device {action.device_id!r}"
    fields = set_fields(action.set)
    if not fields:
        return "action.set must set at least one field"
    allowed = APPLICABLE_FIELDS[device.kind]
    not_applicable = sorted(set(fields) - allowed)
    if not_applicable:
        return (
            f"field(s) {', '.join(not_applicable)} not applicable to a {device.kind} "
            f"(allowed: {', '.join(sorted(allowed))})"
        )
    if "program" in fields and fields["program"] not in device.programs:
        return f"program {fields['program']!r} is not one of the programs of {device.id}"
    return None


def _apply_thermostat(state: SimState, device: ThermostatDevice, fields: dict) -> list[str]:
    if "target_c" not in fields:
        return []
    device.target_c = float(fields["target_c"])
    room = next((r for r in state.rooms if r.id == device.room_id), None)
    if device.failed or (room is not None and room.temperature_c >= device.target_c):
        device.heating = False
    return [f"Zieltemperatur {device.target_c:g} °C"]


def _apply_switch(device: LightDevice | PlugDevice | ApplianceDevice, fields: dict) -> list[str]:
    if "on" not in fields:
        return []
    device.on = bool(fields["on"])
    return ["an" if device.on else "aus"]


def _apply_light(state: SimState, device: LightDevice, fields: dict) -> list[str]:
    parts = _apply_switch(device, fields)
    if "brightness" in fields:
        device.brightness = int(fields["brightness"])
        parts.append(f"Helligkeit {device.brightness} %")
    return parts


def _apply_shutter(state: SimState, device: ShutterDevice, fields: dict) -> list[str]:
    if "position" not in fields:
        return []
    device.position = int(fields["position"])
    return [f"Position {device.position} % geschlossen"]


def _apply_window(state: SimState, device: WindowDevice, fields: dict) -> list[str]:
    if "open" not in fields:
        return []
    device.open = bool(fields["open"])
    return ["geöffnet" if device.open else "geschlossen"]


def _apply_plug(state: SimState, device: PlugDevice, fields: dict) -> list[str]:
    return _apply_switch(device, fields)


def _apply_appliance(state: SimState, device: ApplianceDevice, fields: dict) -> list[str]:
    parts = _apply_switch(device, fields)
    if "program" in fields:
        device.program = str(fields["program"])
        parts.append(f"Programm {device.program}")
    return parts


_APPLIERS = {
    "thermostat": _apply_thermostat,
    "light": _apply_light,
    "shutter": _apply_shutter,
    "window": _apply_window,
    "plug": _apply_plug,
    "appliance": _apply_appliance,
}


def apply_update(state: SimState, device: object, update: DeviceUpdate) -> str:
    """Apply the set fields of ``update`` to ``device``; returns a German description.

    The caller has validated the update with :func:`validate_action`.
    """
    return ", ".join(_APPLIERS[device.kind](state, device, set_fields(update)))


# --------------------------------------------------------------------------- conditions


def _sensor_true(state: SimState, cond: SensorCondition) -> bool:
    if cond.room_id is None:
        current = state.outdoor.temperature_c
    else:
        room = next((r for r in state.rooms if r.id == cond.room_id), None)
        if room is None:
            return False
        current = getattr(room, cond.metric)
    return current < cond.value if cond.op == "<" else current > cond.value


def _contact_true(state: SimState, cond: ContactCondition) -> bool:
    device = find_device(state, cond.device_id)
    return isinstance(device, WindowDevice) and device.open == cond.open


def _motion_true(state: SimState, cond: MotionCondition) -> bool:
    room = next((r for r in state.rooms if r.id == cond.room_id), None)
    if room is None:
        return False
    now = state.clock.sim_time
    window = timedelta(minutes=cond.minutes)
    recent = room.motion or (room.last_motion_at is not None and now - room.last_motion_at < window)
    return recent if cond.detected else not recent


def _time_crossed(cond: TimeCondition, previous: datetime, now: datetime) -> bool:
    """True when the clock passed ``at`` in the interval (previous, now]."""
    hour, minute = (int(part) for part in cond.at.split(":"))
    moment = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if moment > now:
        moment -= timedelta(days=1)
    return previous < moment <= now


def condition_true(state: SimState, automation: AutomationIn) -> bool:
    """The current value of a level condition (every type except ``time``)."""
    cond = automation.condition
    if isinstance(cond, SensorCondition):
        return _sensor_true(state, cond)
    if isinstance(cond, ContactCondition):
        return _contact_true(state, cond)
    if isinstance(cond, MotionCondition):
        return _motion_true(state, cond)
    if isinstance(cond, SunCondition):
        return state.outdoor.sun_up == (cond.state == "up")
    return False


# --------------------------------------------------------------------------- engine


def _memory(sim: Simulation) -> dict[int, bool]:
    memory = _last_values.get(sim)
    if memory is None:
        memory = {}
        _last_values[sim] = memory
    return memory


def prime(sim: Simulation) -> None:
    """Record the current condition values of all automations without firing any."""
    memory = _memory(sim)
    memory.clear()
    for automation in sim.state.automations:
        memory[automation.id] = condition_true(sim.state, automation)


def forget(sim: Simulation, automation_id: int) -> None:
    """Treat this automation as new: it fires as soon as its condition is true."""
    _memory(sim).pop(automation_id, None)


def fire(sim: Simulation, automation: Automation) -> bool:
    """Perform the action of ``automation`` now; False when it cannot be applied."""
    problem = validate_action(sim.state, automation.action)
    if problem is not None:
        logger.warning("automation %s not applied: %s", automation.id, problem)
        return False
    device = find_device(sim.state, automation.action.device_id)
    change = apply_update(sim.state, device, automation.action.set)
    automation.last_fired_at = sim.state.clock.sim_time
    room = ROOM_NAMES.get(device.room_id, device.room_id)
    sim.log(f"Automation „{automation.name}“: {device.name} {room}: {change}", "automation")
    return True


def step(sim: Simulation, dt_s: float) -> None:
    """Fire every enabled automation whose condition has become true."""
    state = sim.state
    now = state.clock.sim_time
    previous = now - timedelta(seconds=dt_s)
    memory = _memory(sim)
    fired: list[Automation] = []
    for automation in state.automations:
        if not automation.enabled:
            memory.pop(automation.id, None)
            continue
        if isinstance(automation.condition, TimeCondition):
            should_fire = _time_crossed(automation.condition, previous, now)
        else:
            current = condition_true(state, automation)
            should_fire = current and not memory.get(automation.id, False)
            memory[automation.id] = current
        if should_fire and fire(sim, automation):
            fired.append(automation)
    if fired:
        _persist_fired(sim, fired)


def _persist_fired(sim: Simulation, fired: list[Automation]) -> None:
    # Imported here: the store imports this module for the defaults.
    from app.store import automations as store

    try:
        for automation in fired:
            store.save_last_fired(sim.conn, automation.id, automation.last_fired_at)
    except Exception:
        logger.exception("could not store last_fired_at of fired automations")
