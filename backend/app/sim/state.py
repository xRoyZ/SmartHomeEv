"""The shared state model of the simulation and the initial house.

Every type of the sprint contract lives here (pydantic v2). The frontend mirrors
them 1:1 in ``frontend/src/types.ts``. Datetimes are naive simulation-time values
and serialize as ISO-8601 strings without a timezone.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# --------------------------------------------------------------------------- enums

RoomId = Literal["wohnzimmer", "kueche", "schlafzimmer", "kinderzimmer", "bad", "flur"]
Weather = Literal["sonnig", "bewoelkt", "regen", "schnee"]
WeatherMode = Literal["auto", "sonnig", "bewoelkt", "regen", "schnee"]
Season = Literal["fruehling", "sommer", "herbst", "winter"]
Behaviour = Literal["standard", "homeoffice", "urlaub"]
Speed = Literal[1, 60, 360, 1440]
EventType = Literal[
    "fenster_vergessen", "wasserschaden", "rauch_kueche", "stromspitze", "heizungsausfall"
]
AlertKind = Literal[
    "zu_kalt",
    "zu_warm",
    "co2_hoch",
    "rauch",
    "wasser",
    "verbrauch_hoch",
    "fenster_heizung",
    "heizungsausfall",
]
Severity = Literal["warnung", "kritisch"]
RoomActivity = Literal["none", "duschen", "kochen", "schlafen"]
ResidentRole = Literal["erwachsen", "kind"]
ActivitySource = Literal["automation", "ereignis", "benutzer", "system"]
HistoryMetric = Literal["temperature", "humidity", "co2", "power"]
SensorMetric = Literal["temperature_c", "humidity_pct", "co2_ppm"]

ROOM_IDS: tuple[RoomId, ...] = (
    "wohnzimmer",
    "kueche",
    "schlafzimmer",
    "kinderzimmer",
    "bad",
    "flur",
)
ROOM_NAMES: dict[str, str] = {
    "wohnzimmer": "Wohnzimmer",
    "kueche": "Küche",
    "schlafzimmer": "Schlafzimmer",
    "kinderzimmer": "Kinderzimmer",
    "bad": "Bad",
    "flur": "Flur",
}
WINDOW_DEVICE_IDS: frozenset[str] = frozenset(f"{room}.fenster" for room in ROOM_IDS)

MAX_ACTIVITY_ENTRIES = 200
DEFAULT_START_TIME = datetime(2026, 1, 15, 6, 0, 0)
DEFAULT_BASE_LOAD_W = 150.0


class Model(BaseModel):
    """Base of every contract model: unknown fields are rejected."""

    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------- clock / settings


class Clock(Model):
    sim_time: datetime
    speed: Speed = 60
    paused: bool = False


class Settings(Model):
    seed: int = Field(default=42, ge=0, le=2147483647)
    start_time: datetime = DEFAULT_START_TIME
    weather_mode: WeatherMode = "auto"
    season: Season = "winter"
    behaviour: Behaviour = "standard"
    speed: Speed = 60
    adults: int = Field(default=2, ge=1, le=4)
    children: int = Field(default=1, ge=0, le=3)


class SettingsUpdate(Model):
    seed: int | None = Field(default=None, ge=0, le=2147483647)
    start_time: datetime | None = None
    weather_mode: WeatherMode | None = None
    season: Season | None = None
    behaviour: Behaviour | None = None
    speed: Speed | None = None
    adults: int | None = Field(default=None, ge=1, le=4)
    children: int | None = Field(default=None, ge=0, le=3)


class SpeedUpdate(Model):
    """Body of PUT /api/simulation/speed."""

    speed: Speed


# --------------------------------------------------------------------------- outdoor / energy


class Outdoor(Model):
    temperature_c: float
    weather: Weather
    sun_elevation_deg: float
    daylight: float = Field(ge=0, le=1)
    sun_up: bool


class Solar(Model):
    production_w: float
    consumption_w: float
    balance_w: float  # production - consumption; >0 Einspeisung, <0 Netzbezug


# --------------------------------------------------------------------------- rooms


class Room(Model):
    id: RoomId
    name: str
    temperature_c: float
    humidity_pct: float
    co2_ppm: float
    light_lux: float
    motion: bool = False
    last_motion_at: datetime | None = None
    activity: RoomActivity = "none"
    smoke: bool | None = None  # None = room has no smoke sensor
    leak: bool | None = None  # None = room has no leak sensor
    door_open: bool | None = None  # None = room has no door contact


# --------------------------------------------------------------------------- devices


class DeviceBase(Model):
    id: str
    room_id: RoomId
    name: str
    power_w: float = 0.0


class ThermostatDevice(DeviceBase):
    kind: Literal["thermostat"] = "thermostat"
    target_c: float = Field(ge=5, le=30)
    heating: bool = False
    failed: bool = False


class LightDevice(DeviceBase):
    kind: Literal["light"] = "light"
    on: bool = False
    brightness: int = Field(default=100, ge=0, le=100)


class ShutterDevice(DeviceBase):
    kind: Literal["shutter"] = "shutter"
    position: int = Field(default=0, ge=0, le=100)  # 100 = fully closed


class WindowDevice(DeviceBase):
    kind: Literal["window"] = "window"
    open: bool = False


class PlugDevice(DeviceBase):
    kind: Literal["plug"] = "plug"
    on: bool = False
    rated_w: float


class ApplianceDevice(DeviceBase):
    kind: Literal["appliance"] = "appliance"
    on: bool = False
    program: str | None = None
    programs: list[str] = Field(default_factory=list)
    rated_w: float


Device = Annotated[
    ThermostatDevice | LightDevice | ShutterDevice | WindowDevice | PlugDevice | ApplianceDevice,
    Field(discriminator="kind"),
]


class DeviceUpdate(Model):
    """Body of PATCH /api/devices/{device_id}; only the fields that are set apply."""

    on: bool | None = None
    brightness: int | None = Field(default=None, ge=0, le=100)
    position: int | None = Field(default=None, ge=0, le=100)
    open: bool | None = None
    target_c: float | None = Field(default=None, ge=5, le=30)
    program: str | None = None


# --------------------------------------------------------------------------- residents


class Resident(Model):
    id: str
    name: str
    role: ResidentRole
    room_id: RoomId | None = None  # None = away
    activity: str


# --------------------------------------------------------------------------- alerts / thresholds


class Thresholds(Model):
    room_min_c: float = Field(default=18, ge=5, le=25)
    room_max_c: float = Field(default=26, ge=15, le=35)
    co2_max_ppm: int = Field(default=1200, ge=400, le=5000)
    power_max_w: int = Field(default=6000, ge=500, le=20000)

    @model_validator(mode="after")
    def _min_below_max(self) -> Thresholds:
        if self.room_min_c >= self.room_max_c:
            raise ValueError("room_min_c must be lower than room_max_c")
        return self


class Alert(Model):
    id: str  # "<kind>:<room_id or 'haus'>"
    kind: AlertKind
    room_id: RoomId | None = None
    message: str
    severity: Severity
    raised_at: datetime
    active: bool = True
    acknowledged: bool = False


# --------------------------------------------------------------------------- automations


class SensorCondition(Model):
    type: Literal["sensor"] = "sensor"
    room_id: RoomId | None = None  # None = outdoor
    metric: SensorMetric
    op: Literal["<", ">"]
    value: float

    @model_validator(mode="after")
    def _outdoor_is_temperature(self) -> SensorCondition:
        if self.room_id is None and self.metric != "temperature_c":
            raise ValueError("an outdoor condition (room_id null) must use metric temperature_c")
        return self


class ContactCondition(Model):
    type: Literal["contact"] = "contact"
    device_id: str
    open: bool

    @model_validator(mode="after")
    def _is_window(self) -> ContactCondition:
        if self.device_id not in WINDOW_DEVICE_IDS:
            raise ValueError("device_id must be a window device id")
        return self


class MotionCondition(Model):
    type: Literal["motion"] = "motion"
    room_id: RoomId
    detected: bool
    minutes: int = Field(ge=1, le=240)


class TimeCondition(Model):
    type: Literal["time"] = "time"
    at: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class SunCondition(Model):
    type: Literal["sun"] = "sun"
    state: Literal["up", "down"]


Condition = Annotated[
    SensorCondition | ContactCondition | MotionCondition | TimeCondition | SunCondition,
    Field(discriminator="type"),
]


class Action(Model):
    device_id: str
    set: DeviceUpdate


class AutomationIn(Model):
    name: str = Field(min_length=1, max_length=80)
    enabled: bool
    condition: Condition
    action: Action


class Automation(AutomationIn):
    id: int
    last_fired_at: datetime | None = None


class EnabledUpdate(Model):
    """Body of PATCH /api/automations/{id}/enabled."""

    enabled: bool


# --------------------------------------------------------------------------- activity / events


class ActivityEntry(Model):
    sim_time: datetime
    message: str
    source: ActivitySource


class EventTrigger(Model):
    """Body of POST /api/events."""

    type: EventType


class ActiveEvent(Model):
    type: EventType
    room_id: RoomId | None = None
    started_at: datetime
    ends_at: datetime | None = None


# --------------------------------------------------------------------------- history


class HistoryPoint(Model):
    t: datetime
    v: float


class HistorySeries(Model):
    key: str
    label: str
    points: list[HistoryPoint] = Field(default_factory=list)


class HistoryResponse(Model):
    metric: HistoryMetric
    from_time: datetime
    to_time: datetime
    series: list[HistorySeries] = Field(default_factory=list)


# --------------------------------------------------------------------------- whole state


class SimState(Model):
    clock: Clock
    settings: Settings
    outdoor: Outdoor
    solar: Solar
    rooms: list[Room]
    devices: list[Device]
    residents: list[Resident]
    alerts: list[Alert] = Field(default_factory=list)
    thresholds: Thresholds = Field(default_factory=Thresholds)
    automations: list[Automation] = Field(default_factory=list)
    activity: list[ActivityEntry] = Field(default_factory=list)  # newest first, max 200
    active_events: list[ActiveEvent] = Field(default_factory=list)
    base_load_w: float = DEFAULT_BASE_LOAD_W
    extra_load_w: float = 0.0


# --------------------------------------------------------------------------- initial house

# Sunrise hour, sunset hour and noon sun elevation per season (central Germany, rounded).
_SUN_BY_SEASON: dict[str, tuple[float, float, float]] = {
    "winter": (8.0, 16.5, 17.0),
    "fruehling": (6.5, 19.5, 40.0),
    "sommer": (5.5, 21.5, 62.0),
    "herbst": (7.5, 18.0, 30.0),
}
_OUTDOOR_MEAN_C: dict[str, float] = {
    "winter": 1.0,
    "fruehling": 11.0,
    "sommer": 21.0,
    "herbst": 10.0,
}
_AUTO_WEATHER: dict[str, Weather] = {
    "winter": "bewoelkt",
    "fruehling": "bewoelkt",
    "sommer": "sonnig",
    "herbst": "regen",
}
_WEATHER_SOLAR_FACTOR: dict[str, float] = {
    "sonnig": 1.0,
    "bewoelkt": 0.45,
    "regen": 0.2,
    "schnee": 0.1,
}
_ROOM_SEASON_OFFSET_C: dict[str, float] = {
    "winter": 0.0,
    "fruehling": 1.0,
    "herbst": 0.5,
    "sommer": 4.0,
}
# Per room: (thermostat target, starting temperature in winter, humidity, CO2).
_ROOM_START: dict[str, tuple[float, float, float, float]] = {
    "wohnzimmer": (21.0, 20.2, 45.0, 600.0),
    "kueche": (20.0, 19.6, 50.0, 620.0),
    "schlafzimmer": (18.0, 18.4, 48.0, 950.0),
    "kinderzimmer": (20.0, 19.4, 47.0, 880.0),
    "bad": (22.0, 21.0, 60.0, 560.0),
    "flur": (18.0, 18.2, 44.0, 520.0),
}
SOLAR_PEAK_W = 6000.0
_ADULT_NAMES = ("Anna", "Markus", "Sabine", "Thomas")
_CHILD_NAMES = ("Lena", "Paul", "Mia")


def _hour_of_day(moment: datetime) -> float:
    return moment.hour + moment.minute / 60 + moment.second / 3600


def _initial_sun(season: str, moment: datetime) -> tuple[float, float, bool]:
    """A coarse sun estimate for the first frame; the environment module refines it."""
    sunrise, sunset, peak = _SUN_BY_SEASON[season]
    hour = _hour_of_day(moment)
    if sunrise <= hour <= sunset:
        elevation = peak * math.sin(math.pi * (hour - sunrise) / (sunset - sunrise))
    else:
        # Below the horizon: deepest around midnight.
        to_edge = min(abs(hour - sunrise), abs(hour - sunset), 24 - abs(hour - sunset))
        elevation = -min(25.0, 4.0 * to_edge)
    daylight = max(0.0, min(1.0, elevation / 30.0))
    return round(elevation, 1), round(daylight, 3), elevation > 0


def _initial_devices(sleeping_rooms: set[str], season: str) -> list:
    devices: list = []
    offset = _ROOM_SEASON_OFFSET_C[season]
    for room in ROOM_IDS:
        target, start_c, _, _ = _ROOM_START[room]
        devices.append(
            ThermostatDevice(
                id=f"{room}.heizung",
                room_id=room,
                name="Heizung",
                target_c=target,
                heating=start_c + offset < target,
            )
        )
        devices.append(LightDevice(id=f"{room}.licht", room_id=room, name="Licht"))
        devices.append(WindowDevice(id=f"{room}.fenster", room_id=room, name="Fenster"))
    for room in ("wohnzimmer", "schlafzimmer", "kinderzimmer", "kueche"):
        devices.append(
            ShutterDevice(
                id=f"{room}.rollladen",
                room_id=room,
                name="Rollladen",
                position=100 if room in sleeping_rooms else 0,
            )
        )
    devices += [
        PlugDevice(id="wohnzimmer.tv", room_id="wohnzimmer", name="Fernseher", rated_w=110.0),
        PlugDevice(id="wohnzimmer.stehlampe", room_id="wohnzimmer", name="Stehlampe", rated_w=40.0),
        ApplianceDevice(
            id="bad.waschmaschine",
            room_id="bad",
            name="Waschmaschine",
            programs=["Baumwolle 40 °C", "Pflegeleicht 30 °C", "Kurz 20 °C"],
            rated_w=2000.0,
        ),
        ApplianceDevice(
            id="kueche.geschirrspueler",
            room_id="kueche",
            name="Geschirrspüler",
            programs=["Eco 50 °C", "Intensiv 70 °C", "Kurz 45 °C"],
            rated_w=1800.0,
        ),
        ApplianceDevice(
            id="kueche.kuehlschrank",
            room_id="kueche",
            name="Kühlschrank",
            on=True,
            programs=[],
            rated_w=150.0,
            power_w=90.0,
        ),
        ApplianceDevice(
            id="kueche.backofen",
            room_id="kueche",
            name="Backofen",
            programs=["Umluft 180 °C", "Ober-/Unterhitze 200 °C", "Grill"],
            rated_w=2500.0,
        ),
        ApplianceDevice(
            id="kueche.kaffeemaschine",
            room_id="kueche",
            name="Kaffeemaschine",
            programs=["Kaffee", "Espresso", "Cappuccino"],
            rated_w=1200.0,
        ),
    ]
    return devices


def _initial_residents(settings: Settings) -> list[Resident]:
    hour = _hour_of_day(settings.start_time)
    asleep = hour < 6.5 or hour >= 22.0
    away = settings.behaviour == "urlaub"
    residents: list[Resident] = []
    for index in range(settings.adults):
        name = _ADULT_NAMES[index]
        if away:
            room, activity = None, "im Urlaub"
        elif asleep:
            room, activity = "schlafzimmer", "schläft"
        else:
            room, activity = "wohnzimmer", "ist zu Hause"
        residents.append(
            Resident(id=name.lower(), name=name, role="erwachsen", room_id=room, activity=activity)
        )
    for index in range(settings.children):
        name = _CHILD_NAMES[index]
        if away:
            room, activity = None, "im Urlaub"
        elif asleep:
            room, activity = "kinderzimmer", "schläft"
        else:
            room, activity = "kinderzimmer", "spielt"
        residents.append(
            Resident(id=name.lower(), name=name, role="kind", room_id=room, activity=activity)
        )
    return residents


def _initial_outdoor(settings: Settings) -> Outdoor:
    weather: Weather = (
        _AUTO_WEATHER[settings.season] if settings.weather_mode == "auto" else settings.weather_mode
    )
    elevation, daylight, sun_up = _initial_sun(settings.season, settings.start_time)
    hour = _hour_of_day(settings.start_time)
    outdoor_c = _OUTDOOR_MEAN_C[settings.season] + 4.0 * math.sin(2 * math.pi * (hour - 9) / 24)
    if weather == "schnee":
        outdoor_c = min(outdoor_c, -1.0)
    return Outdoor(
        temperature_c=round(outdoor_c, 1),
        weather=weather,
        sun_elevation_deg=elevation,
        daylight=daylight,
        sun_up=sun_up,
    )


def _initial_room(
    room: RoomId, season: str, daylight: float, shutter_position: int, sleeping: bool
) -> Room:
    _, start_c, humidity, co2 = _ROOM_START[room]
    window_light = 120.0 if room == "flur" else 400.0
    return Room(
        id=room,
        name=ROOM_NAMES[room],
        temperature_c=round(start_c + _ROOM_SEASON_OFFSET_C[season], 1),
        humidity_pct=humidity,
        co2_ppm=co2,
        light_lux=round(daylight * window_light * (1 - shutter_position / 100), 1),
        activity="schlafen" if sleeping else "none",
        smoke=False if room in ("kueche", "flur", "schlafzimmer") else None,
        leak=False if room in ("bad", "kueche") else None,
        door_open=False if room == "flur" else None,
    )


def build_initial_state(settings: Settings) -> SimState:
    """The whole house at ``settings.start_time``. Deterministic: no randomness."""
    settings = settings.model_copy(deep=True)
    outdoor = _initial_outdoor(settings)

    residents = _initial_residents(settings)
    sleeping_rooms = {r.room_id for r in residents if r.room_id and r.activity == "schläft"}
    devices = _initial_devices(sleeping_rooms, settings.season)
    shutter_by_room = {d.room_id: d.position for d in devices if isinstance(d, ShutterDevice)}
    rooms = [
        _initial_room(
            room,
            settings.season,
            outdoor.daylight,
            shutter_by_room.get(room, 0),
            room in sleeping_rooms,
        )
        for room in ROOM_IDS
    ]

    consumption = DEFAULT_BASE_LOAD_W + sum(d.power_w for d in devices)
    production = (
        round(SOLAR_PEAK_W * outdoor.daylight * _WEATHER_SOLAR_FACTOR[outdoor.weather], 1)
        if outdoor.sun_up
        else 0.0
    )
    return SimState(
        clock=Clock(sim_time=settings.start_time, speed=settings.speed, paused=False),
        settings=settings,
        outdoor=outdoor,
        solar=Solar(
            production_w=production,
            consumption_w=consumption,
            balance_w=round(production - consumption, 1),
        ),
        rooms=rooms,
        devices=devices,
        residents=residents,
        thresholds=Thresholds(),
        base_load_w=DEFAULT_BASE_LOAD_W,
        extra_load_w=0.0,
    )


# --------------------------------------------------------------------------- alert helpers


def make_alert_id(kind: str, room_id: str | None) -> str:
    """The stable id of an alert: one per kind and room (``haus`` for the whole house)."""
    return f"{kind}:{room_id or 'haus'}"


def raise_alert(
    state: SimState,
    kind: AlertKind,
    room_id: RoomId | None,
    message: str,
    severity: str,
    now: datetime,
) -> Alert:
    """Activate the alert with this kind/room, or keep it if it is already active.

    An already active alert keeps its ``raised_at`` and acknowledgement and only takes
    the current message/severity. An inactive or unknown one is (re)raised as new and
    unacknowledged and moves to the front of ``state.alerts``.
    """
    if severity not in ("warnung", "kritisch"):
        raise ValueError(f"unknown severity {severity!r}")
    wanted = make_alert_id(kind, room_id)
    for index, existing in enumerate(state.alerts):
        if existing.id != wanted:
            continue
        if existing.active:
            existing.message = message
            existing.severity = severity
            return existing
        state.alerts.pop(index)
        break
    alert = Alert(
        id=wanted,
        kind=kind,
        room_id=room_id,
        message=message,
        severity=severity,
        raised_at=now,
        active=True,
        acknowledged=False,
    )
    state.alerts.insert(0, alert)
    return alert


def resolve_alert(state: SimState, alert_id: str) -> None:
    """Mark the alert with this id as no longer active (unknown ids are ignored)."""
    for alert in state.alerts:
        if alert.id == alert_id:
            alert.active = False
            return
