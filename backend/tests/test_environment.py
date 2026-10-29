"""Tests of the outdoor environment: sun, weather, temperature and solar production."""

from __future__ import annotations

from datetime import datetime

from app import db
from app.engine import Simulation
from app.sim import environment
from app.sim.state import Settings


def make_sim(**settings: object) -> Simulation:
    conn = db.connect(":memory:")
    db.init_schema(conn)
    return Simulation(Settings(**settings), conn)


def run_hours(sim: Simulation, hours: float) -> None:
    sim.advance(hours * 3600)


def test_solar_is_zero_at_night() -> None:
    sim = make_sim(season="sommer", weather_mode="sonnig", start_time=datetime(2026, 7, 1, 21, 0))
    run_hours(sim, 2)  # 23:00, well after the summer sunset
    assert not sim.state.outdoor.sun_up
    assert sim.state.outdoor.daylight == 0
    assert sim.state.outdoor.sun_elevation_deg < 0
    assert sim.state.solar.production_w == 0


def test_solar_produces_at_noon_and_drops_after_sunset() -> None:
    sim = make_sim(season="winter", weather_mode="sonnig", start_time=datetime(2026, 1, 15, 11, 0))
    run_hours(sim, 1)
    assert sim.state.outdoor.sun_up
    assert sim.state.solar.production_w > 500
    run_hours(sim, 6)  # 18:00, after the winter sunset at 16:30
    assert sim.state.solar.production_w == 0


def test_rain_lowers_solar_compared_to_sun() -> None:
    start = datetime(2026, 6, 1, 12, 0)
    sunny = make_sim(season="sommer", weather_mode="sonnig", start_time=start)
    rainy = make_sim(season="sommer", weather_mode="regen", start_time=start)
    run_hours(sunny, 1)
    run_hours(rainy, 1)
    assert sunny.state.clock.sim_time == rainy.state.clock.sim_time
    assert rainy.state.outdoor.weather == "regen"
    assert 0 < rainy.state.solar.production_w < sunny.state.solar.production_w


def test_manual_weather_applies_immediately() -> None:
    sim = make_sim(weather_mode="auto")
    sim.state.settings.weather_mode = "regen"
    sim.advance(1)
    assert sim.state.outdoor.weather == "regen"


def test_winter_is_colder_than_summer() -> None:
    start = datetime(2026, 3, 1, 6, 0)
    winter = make_sim(season="winter", weather_mode="bewoelkt", start_time=start)
    summer = make_sim(season="sommer", weather_mode="bewoelkt", start_time=start)
    for _ in range(24):
        run_hours(winter, 1)
        run_hours(summer, 1)
        assert winter.state.outdoor.temperature_c < summer.state.outdoor.temperature_c


def test_switching_to_winter_lowers_temperature() -> None:
    sim = make_sim(season="sommer", weather_mode="sonnig", start_time=datetime(2026, 7, 1, 12, 0))
    run_hours(sim, 1)
    before = sim.state.outdoor.temperature_c
    sim.state.settings.season = "winter"
    run_hours(sim, 2)
    assert sim.state.outdoor.temperature_c < before - 10


def test_temperature_and_daylight_change_over_the_day() -> None:
    sim = make_sim(season="fruehling", weather_mode="sonnig", start_time=datetime(2026, 4, 1, 4, 0))
    temps, daylights = [], []
    for _ in range(24):
        run_hours(sim, 1)
        temps.append(sim.state.outdoor.temperature_c)
        daylights.append(sim.state.outdoor.daylight)
    assert max(temps) - min(temps) > 4
    assert min(daylights) == 0
    assert max(daylights) == 1


def test_sunrise_shifts_with_season() -> None:
    moment = datetime(2026, 1, 1, 7, 0)
    assert environment.sun_elevation("sommer", moment) > 0
    assert environment.sun_elevation("winter", moment) < 0


def weather_trace(seed: int, season: str = "winter") -> list[tuple[str, float]]:
    sim = make_sim(seed=seed, season=season, weather_mode="auto")
    trace = []
    for _ in range(72):
        run_hours(sim, 1)
        trace.append((sim.state.outdoor.weather, sim.state.outdoor.temperature_c))
    return trace


def test_auto_weather_is_reproducible_with_the_same_seed() -> None:
    first = weather_trace(7)
    assert first == weather_trace(7)
    assert len({weather for weather, _ in first}) > 1  # it really changes


def test_auto_weather_has_no_snow_in_summer() -> None:
    for seed in (1, 2, 3):
        assert all(weather != "schnee" for weather, _ in weather_trace(seed, "sommer"))


def test_auto_snow_only_when_cold() -> None:
    for seed in (1, 2, 3, 4):
        for weather, temperature in weather_trace(seed, "winter"):
            if weather == "schnee":
                assert temperature <= environment.SNOW_MELT_ABOVE_C
