"""Outdoor weather, season, sun position and solar production.

Each substep this module
- places the sun from the simulation time and the season (sunrise and sunset shift
  with the season), and derives ``daylight`` (0..1) and ``sun_up`` from it;
- lets the weather follow ``settings.weather_mode``: a manual value applies at once,
  ``auto`` changes it now and then via ``sim.rng`` in a season-plausible way, with
  ``schnee`` only at low temperatures;
- moves the outdoor temperature towards a target made of the season's baseline, a
  day/night curve and the weather;
- sets ``state.solar.production_w`` from the sun and the weather (0 W while the sun
  is down). Consumption and balance belong to the power module.

Deterministic: the only randomness is ``sim.rng``.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import TYPE_CHECKING

from app.sim.state import SOLAR_PEAK_W, Weather

if TYPE_CHECKING:
    from app.engine import Simulation

# Sunrise hour, sunset hour and noon sun elevation (deg) per season (central Germany).
SUN_BY_SEASON: dict[str, tuple[float, float, float]] = {
    "winter": (8.0, 16.5, 17.0),
    "fruehling": (6.5, 19.5, 40.0),
    "sommer": (5.5, 21.5, 62.0),
    "herbst": (7.5, 18.0, 30.0),
}
# How deep the sun sinks below the horizon around midnight (deg) per season.
NIGHT_DEPTH_BY_SEASON: dict[str, float] = {
    "winter": 64.0,
    "fruehling": 40.0,
    "sommer": 18.0,
    "herbst": 50.0,
}
# Elevation at which daylight reaches its full value.
FULL_DAYLIGHT_ELEVATION_DEG = 30.0

# Daily mean outdoor temperature and half the day/night swing per season (deg C).
OUTDOOR_MEAN_C: dict[str, float] = {
    "winter": 1.0,
    "fruehling": 11.0,
    "sommer": 21.0,
    "herbst": 10.0,
}
OUTDOOR_SWING_C: dict[str, float] = {
    "winter": 3.0,
    "fruehling": 5.0,
    "sommer": 6.0,
    "herbst": 4.0,
}
# Per weather: (offset to the mean in deg C, factor on the day/night swing).
WEATHER_TEMPERATURE: dict[str, tuple[float, float]] = {
    "sonnig": (1.0, 1.3),
    "bewoelkt": (0.0, 0.7),
    "regen": (-2.0, 0.5),
    "schnee": (-2.0, 0.5),
}
# Manual snow keeps it freezing (same cap the initial state uses).
SNOW_MAX_C = -1.0
# Outdoor temperature follows its target with this time constant (sim seconds).
TEMPERATURE_TAU_S = 15 * 60.0

# Share of the clear-sky solar output per weather.
WEATHER_SOLAR_FACTOR: dict[str, float] = {
    "sonnig": 1.0,
    "bewoelkt": 0.45,
    "regen": 0.2,
    "schnee": 0.1,
}

# Automatic weather: mean duration of one weather spell and the season's odds.
MEAN_WEATHER_SPELL_S = 3 * 3600.0
AUTO_WEATHER_WEIGHTS: dict[str, dict[Weather, float]] = {
    "winter": {"sonnig": 0.25, "bewoelkt": 0.4, "regen": 0.15, "schnee": 0.2},
    "fruehling": {"sonnig": 0.35, "bewoelkt": 0.35, "regen": 0.25, "schnee": 0.05},
    "sommer": {"sonnig": 0.6, "bewoelkt": 0.25, "regen": 0.15, "schnee": 0.0},
    "herbst": {"sonnig": 0.25, "bewoelkt": 0.4, "regen": 0.33, "schnee": 0.02},
}
# Snow may start only at or below this outdoor temperature and turns to rain above the second.
SNOW_START_MAX_C = 1.5
SNOW_MELT_ABOVE_C = 2.5


def hour_of_day(moment: datetime) -> float:
    """The time of day as a fractional hour (0 <= h < 24)."""
    return moment.hour + moment.minute / 60 + moment.second / 3600 + moment.microsecond / 3.6e9


def sun_elevation(season: str, moment: datetime) -> float:
    """The sun's elevation in degrees: positive between sunrise and sunset, else negative."""
    sunrise, sunset, peak = SUN_BY_SEASON[season]
    hour = hour_of_day(moment)
    day_length = sunset - sunrise
    if sunrise <= hour <= sunset:
        return peak * math.sin(math.pi * (hour - sunrise) / day_length)
    night_length = 24.0 - day_length
    since_sunset = (hour - sunset) % 24.0
    return -NIGHT_DEPTH_BY_SEASON[season] * math.sin(math.pi * since_sunset / night_length)


def daylight_from_elevation(elevation_deg: float) -> float:
    """Daylight 0..1: dark below the horizon, full from 30 deg elevation."""
    return max(0.0, min(1.0, elevation_deg / FULL_DAYLIGHT_ELEVATION_DEG))


def solar_production(daylight: float, sun_up: bool, weather: str) -> float:
    """Solar output in W: 0 while the sun is down, scaled by daylight and weather."""
    if not sun_up:
        return 0.0
    return round(SOLAR_PEAK_W * daylight * WEATHER_SOLAR_FACTOR[weather], 1)


def target_temperature(season: str, weather: str, moment: datetime, manual: bool) -> float:
    """The outdoor temperature the weather is heading to (coldest ~03:00, warmest ~15:00)."""
    offset, swing_factor = WEATHER_TEMPERATURE[weather]
    hour = hour_of_day(moment)
    swing = OUTDOOR_SWING_C[season] * swing_factor
    target = OUTDOOR_MEAN_C[season] + offset + swing * math.sin(2 * math.pi * (hour - 9) / 24)
    if manual and weather == "schnee":
        target = min(target, SNOW_MAX_C)
    return target


def _next_auto_weather(sim: Simulation, dt_s: float) -> Weather:
    """Advance the automatic weather by one substep (always draws one number from rng)."""
    state = sim.state
    current: Weather = state.outdoor.weather
    temperature = state.outdoor.temperature_c
    weights = AUTO_WEATHER_WEIGHTS[state.settings.season]

    change_probability = min(1.0, dt_s / MEAN_WEATHER_SPELL_S)
    if sim.rng.random() < change_probability:
        options = list(weights)
        current = sim.rng.choices(options, weights=[weights[w] for w in options])[0]
        if current == "schnee" and temperature > SNOW_START_MAX_C:
            current = "regen"
    # Weather the season does not allow (season was just changed) or snow that got too
    # warm turns into a plausible neighbour without waiting for the next spell.
    if current == "schnee" and (temperature > SNOW_MELT_ABOVE_C or weights["schnee"] <= 0):
        current = "regen"
    return current


def step(sim: Simulation, dt_s: float) -> None:
    """Advance outdoor conditions and solar production by ``dt_s`` simulated seconds."""
    state = sim.state
    settings = state.settings
    outdoor = state.outdoor
    now = state.clock.sim_time

    # Sun.
    elevation = sun_elevation(settings.season, now)
    outdoor.sun_elevation_deg = round(elevation, 1)
    outdoor.sun_up = elevation > 0
    outdoor.daylight = round(daylight_from_elevation(elevation), 3)

    # Weather.
    manual = settings.weather_mode != "auto"
    if manual:
        outdoor.weather = settings.weather_mode
    else:
        outdoor.weather = _next_auto_weather(sim, dt_s)

    # Temperature: relax towards the target so a weather change does not jump.
    target = target_temperature(settings.season, outdoor.weather, now, manual)
    if dt_s > 0:
        alpha = 1.0 - math.exp(-dt_s / TEMPERATURE_TAU_S)
        temperature = outdoor.temperature_c + (target - outdoor.temperature_c) * alpha
        if manual and outdoor.weather == "schnee":
            temperature = min(temperature, SNOW_MAX_C)
        outdoor.temperature_c = round(temperature, 2)

    # Solar production (consumption and balance belong to the power module).
    state.solar.production_w = solar_production(outdoor.daylight, outdoor.sun_up, outdoor.weather)
