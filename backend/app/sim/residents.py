"""The residents' daily routine: where they are and what they do.

Every resident follows a schedule derived from the simulated time of day and
``settings.behaviour``:

* ``standard`` — wake up, shower in the Bad (one after another), breakfast in the
  Küche (the adults start the Kaffeemaschine), leave through the Flur, come back in
  the afternoon, one adult cooks with the Backofen, dinner, TV in the Wohnzimmer,
  sleep.
* ``homeoffice`` — the adults stay home and work in a room during the day (one of
  them cooks lunch); the children still go to school.
* ``urlaub`` — everyone is away: no motion anywhere.

The schedule moves the residents (``room_id``/``activity``) and drives what follows
them: ``room.motion``/``last_motion_at`` for rooms with an awake resident (a sleeping
resident does not trigger the motion sensor; an empty room clears it),
``room.activity``, the lights (on when an awake resident is in a dark room, off when
the room is left or everyone in it goes to sleep), the appliances and the TV, and a
brief ``flur.door_open`` while someone leaves or comes home.

Devices are switched on EDGES only (when a need starts or ends), so a user who turns
the TV off while someone watches keeps it off. The only randomness is a small
per-resident, per-day timing jitter drawn from ``sim.rng``.
"""

from __future__ import annotations

import weakref
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import TYPE_CHECKING

from app.sim.state import (
    ApplianceDevice,
    LightDevice,
    PlugDevice,
    Resident,
    RoomActivity,
    RoomId,
    ShutterDevice,
    SimState,
)

if TYPE_CHECKING:
    from app.engine import Simulation

# Kinds of what a resident does; they decide room activity, motion and devices.
SLEEP = "sleep"
SHOWER = "shower"
COFFEE = "coffee"
BREAKFAST = "breakfast"
COOK = "cook"
EAT = "eat"
TV = "tv"
WORK = "work"
RELAX = "relax"
PLAY = "play"
WAKE = "wake"
LEAVING = "leaving"
RETURNING = "returning"
AWAY = "away"

ROOM_ACTIVITY_BY_KIND: dict[str, RoomActivity] = {
    SHOWER: "duschen",
    COOK: "kochen",
    SLEEP: "schlafen",
}
# Higher wins when several residents share a room.
_ROOM_ACTIVITY_PRIORITY: dict[str, int] = {"none": 0, "schlafen": 1, "kochen": 2, "duschen": 3}

# Device a kind needs, and the program an appliance is started with.
DEVICE_BY_KIND: dict[str, str] = {
    COFFEE: "kueche.kaffeemaschine",
    COOK: "kueche.backofen",
    TV: "wohnzimmer.tv",
}
PROGRAM_BY_DEVICE: dict[str, str] = {
    "kueche.kaffeemaschine": "Kaffee",
    "kueche.backofen": "Umluft 180 °C",
}

# Minutes of the day.
SHOWER_FIRST_MIN = 6 * 60 + 30  # 06:30
SHOWER_SLOT_MIN = 15
SHOWER_DURATION_MIN = 12
COFFEE_DURATION_MIN = 6
LEAVE_MIN = 7 * 60 + 45  # 07:45
TRANSIT_MIN = 3
ADULT_RETURN_MIN = 17 * 60  # 17:00
CHILD_RETURN_MIN = 13 * 60 + 30  # 13:30
COOK_START_MIN = 17 * 60 + 45  # 17:45
DINNER_MIN = 18 * 60 + 30  # 18:30
EVENING_MIN = 19 * 60  # 19:00
CHILD_BED_MIN = 20 * 60  # 20:00
ADULT_BED_MIN = 22 * 60 + 30  # 22:30
LUNCH_MIN = 12 * 60 + 30  # 12:30
LUNCH_COOK_END_MIN = 13 * 60  # 13:00
LUNCH_END_MIN = 13 * 60 + 15  # 13:15
HOMEOFFICE_ROOMS: tuple[RoomId, ...] = ("wohnzimmer", "schlafzimmer", "kueche", "wohnzimmer")

JITTER_MIN = 10  # +- minutes on the everyday times
SHOWER_JITTER_MIN = 3  # 0..3 minutes, so the shower slots never overlap

# Below this share of daylight reaching a room it counts as dark.
DARK_THRESHOLD = 0.25
FLUR_LIGHT_FACTOR = 0.5  # the hallway only has a small window


@dataclass
class Jitter:
    """One resident's timing offsets for one simulated day (minutes)."""

    shower: float = 0.0
    wake: float = 0.0
    leave: float = 0.0
    back: float = 0.0
    cook: float = 0.0
    evening: float = 0.0
    bed: float = 0.0


@dataclass
class _Memory:
    """What this module remembers between substeps for one simulation state."""

    state: SimState
    day: date | None = None
    jitter: dict[str, Jitter] = field(default_factory=dict)
    needed_devices: set[str] = field(default_factory=set)
    lit_rooms: set[str] = field(default_factory=set)
    door_open: bool = False


_memories: weakref.WeakKeyDictionary[Simulation, _Memory] = weakref.WeakKeyDictionary()


def _memory(sim: Simulation) -> _Memory:
    """This simulation's memory; a fresh one after a reset replaced ``sim.state``."""
    memory = _memories.get(sim)
    if memory is None or memory.state is not sim.state:
        memory = _Memory(state=sim.state)
        _memories[sim] = memory
    return memory


def _draw_jitter(sim: Simulation, memory: _Memory, today: date) -> None:
    """Draw every resident's offsets for a new day, in resident order (deterministic)."""
    rng = sim.rng
    memory.day = today
    memory.jitter = {}
    for resident in sim.state.residents:
        memory.jitter[resident.id] = Jitter(
            shower=rng.uniform(0, SHOWER_JITTER_MIN),
            wake=rng.uniform(0, 4),
            leave=rng.uniform(-JITTER_MIN / 2, JITTER_MIN),
            back=rng.uniform(-JITTER_MIN, JITTER_MIN),
            cook=rng.uniform(0, JITTER_MIN),
            evening=rng.uniform(-JITTER_MIN, JITTER_MIN),
            bed=rng.uniform(-JITTER_MIN, JITTER_MIN),
        )


def _minute_of_day(moment: datetime) -> float:
    return moment.hour * 60 + moment.minute + moment.second / 60 + moment.microsecond / 6e7


@dataclass(frozen=True)
class _Day:
    """The key times of one resident's day (minutes), derived from role and jitter."""

    adult: bool
    index: int
    bedroom: RoomId
    wake: float
    shower: float
    shower_end: float
    leave: float
    bed: float


Slot = tuple[RoomId | None, str, str]


def _day(role: str, index: int, slot: int, jitter: Jitter) -> _Day:
    adult = role == "erwachsen"
    shower = SHOWER_FIRST_MIN + SHOWER_SLOT_MIN * slot + jitter.shower
    shower_end = shower + SHOWER_DURATION_MIN
    bed_base = ADULT_BED_MIN if adult else CHILD_BED_MIN + 15 * index
    return _Day(
        adult=adult,
        index=index,
        bedroom="schlafzimmer" if adult else "kinderzimmer",
        wake=shower - 12 + jitter.wake,
        shower=shower,
        shower_end=shower_end,
        leave=max(LEAVE_MIN + jitter.leave, shower_end + 15),
        bed=bed_base + jitter.bed,
    )


def _morning(day: _Day, minute: float) -> Slot:
    """Before ``day.leave``: sleep, get up, shower, breakfast (``bed`` handled too)."""
    if minute < day.wake or minute >= day.bed:
        return day.bedroom, "schläft", SLEEP
    if minute < day.shower:
        return day.bedroom, "steht auf", WAKE
    if minute < day.shower_end:
        return "bad", "duscht", SHOWER
    if day.adult and minute < day.shower_end + COFFEE_DURATION_MIN:
        return "kueche", "kocht Kaffee", COFFEE
    return "kueche", "frühstückt", BREAKFAST


def _homeoffice(day: _Day, minute: float, jitter: Jitter) -> Slot | None:
    """An adult working from home; None once the working day is over."""
    office = HOMEOFFICE_ROOMS[day.index % len(HOMEOFFICE_ROOMS)]
    if LUNCH_MIN <= minute < LUNCH_END_MIN:
        if day.index == 0 and minute < LUNCH_COOK_END_MIN:
            return "kueche", "kocht Mittagessen", COOK
        return "kueche", "isst zu Mittag", EAT
    if minute < COOK_START_MIN + jitter.cook:
        return office, "arbeitet im Homeoffice", WORK
    return None


def _out_of_house(day: _Day, minute: float, jitter: Jitter) -> Slot | None:
    """Leaving, away at work/school, coming home; None once back home."""
    back = (ADULT_RETURN_MIN + 15 * day.index if day.adult else CHILD_RETURN_MIN) + jitter.back
    if minute < day.leave + TRANSIT_MIN:
        return "flur", "verlässt das Haus", LEAVING
    if minute < back:
        return None, ("bei der Arbeit" if day.adult else "in der Schule"), AWAY
    if minute < back + TRANSIT_MIN:
        return "flur", "kommt nach Hause", RETURNING
    return None


def _evening(day: _Day, minute: float, jitter: Jitter) -> Slot:
    """At home from the afternoon until bed."""
    if minute < DINNER_MIN:
        if day.adult and day.index == 0 and minute >= COOK_START_MIN + jitter.cook:
            return "kueche", "kocht Abendessen", COOK
        if day.adult:
            return "wohnzimmer", "entspannt sich", RELAX
        return "kinderzimmer", "spielt", PLAY
    if minute < EVENING_MIN:
        return "kueche", "isst zu Abend", EAT
    if day.adult and minute >= ADULT_BED_MIN - 30 + jitter.evening:
        return "wohnzimmer", "liest", RELAX
    return "wohnzimmer", "sieht fern", TV


def plan(
    role: str,
    index: int,
    slot: int,
    behaviour: str,
    minute: float,
    jitter: Jitter,
) -> tuple[RoomId | None, str, str]:
    """Where a resident is and what they do at ``minute`` of the day.

    ``index`` counts within the role (adults 0.., children 0..), ``slot`` over all
    residents (it orders the showers). Returns ``(room_id, activity text, kind)``;
    ``room_id`` None means away from home.
    """
    if behaviour == "urlaub":
        return None, "im Urlaub", AWAY
    day = _day(role, index, slot, jitter)
    if minute < day.leave or minute >= day.bed:
        return _morning(day, minute)
    if day.adult and behaviour == "homeoffice":
        daytime = _homeoffice(day, minute, jitter)
    else:
        daytime = _out_of_house(day, minute, jitter)
    return daytime or _evening(day, minute, jitter)


def _room_is_dark(state: SimState, room_id: str) -> bool:
    """Whether too little daylight reaches the room (outdoor light behind the shutter)."""
    light = state.outdoor.daylight
    if room_id == "flur":
        light *= FLUR_LIGHT_FACTOR
    for device in state.devices:
        if isinstance(device, ShutterDevice) and device.room_id == room_id:
            light *= 1 - device.position / 100
    return light < DARK_THRESHOLD


def _switch_on(state: SimState, device_id: str) -> None:
    for device in state.devices:
        if device.id != device_id:
            continue
        if isinstance(device, LightDevice):
            device.on = True
            if device.brightness == 0:
                device.brightness = 80
        elif isinstance(device, PlugDevice):
            device.on = True
        elif isinstance(device, ApplianceDevice):
            device.on = True
            wanted = PROGRAM_BY_DEVICE.get(device_id)
            if device.programs and device.program not in device.programs:
                device.program = wanted if wanted in device.programs else device.programs[0]
        return


def _switch_off(state: SimState, device_id: str) -> None:
    for device in state.devices:
        if device.id != device_id:
            continue
        if isinstance(device, LightDevice | PlugDevice):
            device.on = False
        elif isinstance(device, ApplianceDevice):
            device.on = False
            device.program = None
        return


def _move(sim: Simulation, resident: Resident, room_id: RoomId | None, activity: str) -> None:
    if resident.room_id is not None and room_id is None:
        sim.log(f"{resident.name} verlässt das Haus", "system")
    elif resident.room_id is None and room_id is not None:
        sim.log(f"{resident.name} kommt nach Hause", "system")
    resident.room_id = room_id
    resident.activity = activity


def _move_residents(sim: Simulation, memory: _Memory, minute: float) -> dict[str, str]:
    """Put every resident where the plan says; returns the kind per resident id."""
    behaviour = sim.state.settings.behaviour
    kinds: dict[str, str] = {}
    counters = {"erwachsen": 0, "kind": 0}
    for slot, resident in enumerate(sim.state.residents):
        index = counters[resident.role]
        counters[resident.role] += 1
        jitter = memory.jitter.get(resident.id) or Jitter()
        room_id, activity, kind = plan(resident.role, index, slot, behaviour, minute, jitter)
        _move(sim, resident, room_id, activity)
        kinds[resident.id] = kind
    return kinds


def _update_rooms(state: SimState, kinds: dict[str, str]) -> set[str]:
    """Set motion and activity of every room; returns the rooms with an awake resident."""
    awake_rooms: set[str] = set()
    room_activity: dict[str, RoomActivity] = {}
    for resident in state.residents:
        if resident.room_id is None:
            continue
        kind = kinds[resident.id]
        if kind != SLEEP:
            awake_rooms.add(resident.room_id)
        candidate = ROOM_ACTIVITY_BY_KIND.get(kind, "none")
        current = room_activity.get(resident.room_id, "none")
        if _ROOM_ACTIVITY_PRIORITY[candidate] > _ROOM_ACTIVITY_PRIORITY[current]:
            room_activity[resident.room_id] = candidate
    now = state.clock.sim_time
    for room in state.rooms:
        room.activity = room_activity.get(room.id, "none")
        room.motion = room.id in awake_rooms
        if room.motion:
            room.last_motion_at = now
    return awake_rooms


def _update_lights(state: SimState, memory: _Memory, awake_rooms: set[str]) -> None:
    """On when an awake resident is in a dark room, off when that room is left."""
    lit_now = {room_id for room_id in awake_rooms if _room_is_dark(state, room_id)}
    for room_id in sorted(lit_now - memory.lit_rooms):
        _switch_on(state, f"{room_id}.licht")
    for room_id in sorted(memory.lit_rooms - awake_rooms):
        _switch_off(state, f"{room_id}.licht")
    # A room stays "lit by us" while occupied, even if daylight comes up meanwhile.
    memory.lit_rooms = (memory.lit_rooms & awake_rooms) | lit_now


def _update_devices(state: SimState, memory: _Memory, kinds: dict[str, str]) -> None:
    """Appliances and TV, switched on the edges of the need only."""
    needed = {DEVICE_BY_KIND[k] for k in kinds.values() if k in DEVICE_BY_KIND}
    for device_id in sorted(needed - memory.needed_devices):
        _switch_on(state, device_id)
    for device_id in sorted(memory.needed_devices - needed):
        _switch_off(state, device_id)
    memory.needed_devices = needed


def _update_door(state: SimState, memory: _Memory, kinds: dict[str, str]) -> None:
    """The front door opens briefly while someone leaves or comes home."""
    door_open = any(k in (LEAVING, RETURNING) for k in kinds.values())
    if door_open == memory.door_open:
        return
    for room in state.rooms:
        if room.door_open is not None:
            room.door_open = door_open
    memory.door_open = door_open


def step(sim: Simulation, dt_s: float) -> None:
    """Move every resident along their routine and update what follows them."""
    state = sim.state
    memory = _memory(sim)
    now = state.clock.sim_time
    if memory.day != now.date():
        _draw_jitter(sim, memory, now.date())
    kinds = _move_residents(sim, memory, _minute_of_day(now))
    awake_rooms = _update_rooms(state, kinds)
    _update_lights(state, memory, awake_rooms)
    _update_devices(state, memory, kinds)
    _update_door(state, memory, kinds)
