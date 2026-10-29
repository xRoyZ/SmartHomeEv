"""History sampling, pruning, persistence and the GET /api/history endpoint."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app import db, history
from app.deps import get_sim
from app.engine import Simulation
from app.main import app
from app.sim.state import ROOM_IDS, Settings


def run_with_sampling(sim: Simulation, hours: float, step_s: float = 300.0) -> None:
    """Advance ``hours`` simulated hours, sampling after every step like the loop does."""
    history.sample(sim)
    for _ in range(int(hours * 3600 / step_s)):
        sim.advance(step_s)
        history.sample(sim)


def count_rows(sim: Simulation) -> int:
    return sim.conn.execute("SELECT COUNT(*) FROM history").fetchone()[0]


def test_temperature_series_cover_24_hours_and_include_outdoor(sim: Simulation) -> None:
    start = sim.state.clock.sim_time
    run_with_sampling(sim, 24)
    now = sim.state.clock.sim_time

    result = history.query(sim.conn, "temperature", None, 24, now)

    keys = [s.key for s in result.series]
    assert keys == [*ROOM_IDS, "aussen"]
    labels = {s.key: s.label for s in result.series}
    assert labels["wohnzimmer"] == "Wohnzimmer"
    assert labels["aussen"] == "Außen"
    for series in result.series:
        times = [p.t for p in series.points]
        assert times == sorted(times)
        assert times[0] <= start + timedelta(minutes=5)
        assert times[-1] >= now - timedelta(minutes=5)
        assert len(times) >= 24 * 12
    assert result.to_time == now
    assert result.from_time == now - timedelta(hours=24)


def test_power_returns_consumption_and_solar(sim: Simulation) -> None:
    run_with_sampling(sim, 2)
    result = history.query(sim.conn, "power", "kueche", 24, sim.state.clock.sim_time)
    assert [s.key for s in result.series] == ["verbrauch", "solar"]
    assert [s.label for s in result.series] == ["Verbrauch", "Solarertrag"]
    assert all(len(s.points) > 0 for s in result.series)


def test_room_filter_returns_only_that_room(sim: Simulation) -> None:
    run_with_sampling(sim, 1)
    now = sim.state.clock.sim_time
    temps = history.query(sim.conn, "temperature", "bad", 24, now)
    assert [s.key for s in temps.series] == ["bad", "aussen"]
    co2 = history.query(sim.conn, "co2", "bad", 24, now)
    assert [s.key for s in co2.series] == ["bad"]
    assert co2.series[0].label == "Bad"
    assert len(co2.series[0].points) > 0


def test_at_most_one_sample_per_five_minutes(sim: Simulation) -> None:
    history.sample(sim)
    per_sample = count_rows(sim)
    assert per_sample == len(ROOM_IDS) * 3 + 3
    for _ in range(10):  # 10 x 20 s = 200 s: no boundary crossed after 06:00
        sim.advance(20)
        history.sample(sim)
    assert count_rows(sim) == per_sample
    sim.advance(500)  # to 06:11:40: crosses the 06:05 and 06:10 boundaries
    history.sample(sim)
    assert count_rows(sim) == per_sample * 3


def test_rows_older_than_seven_days_are_pruned(sim: Simulation) -> None:
    history.sample(sim)
    first = sim.conn.execute("SELECT MIN(sim_time) FROM history").fetchone()[0]
    sim.state.clock.sim_time += timedelta(days=7, minutes=10)
    history.sample(sim)
    oldest = sim.conn.execute("SELECT MIN(sim_time) FROM history").fetchone()[0]
    assert oldest > first


def test_rows_survive_a_reconnect(tmp_path) -> None:
    path = str(tmp_path / "history.db")
    conn = db.connect(path)
    db.init_schema(conn)
    sim = Simulation(Settings(), conn)
    run_with_sampling(sim, 1)
    now = sim.state.clock.sim_time
    before = history.query(conn, "temperature", None, 24, now)
    conn.close()

    conn = db.connect(path)
    try:
        db.init_schema(conn)
        after = history.query(conn, "temperature", None, 24, now)
    finally:
        conn.close()
    assert after == before
    assert all(len(s.points) > 0 for s in after.series)


def test_on_reset_empties_history(sim: Simulation) -> None:
    run_with_sampling(sim, 1)
    assert count_rows(sim) > 0
    sim.reset()
    assert count_rows(sim) == 0


@pytest.fixture
def api_sim(client: TestClient) -> Iterator[tuple[TestClient, Simulation]]:
    """The real app, its history endpoint answering for a standalone simulation."""
    conn = db.connect(":memory:")
    db.init_schema(conn)
    own = Simulation(Settings(), conn)
    app.dependency_overrides[get_sim] = lambda: own
    try:
        yield client, own
    finally:
        app.dependency_overrides.pop(get_sim, None)
        conn.close()


def test_endpoint_returns_rooms_and_outdoor(api_sim: tuple[TestClient, Simulation]) -> None:
    client, own = api_sim
    run_with_sampling(own, 3)
    response = client.get("/api/history", params={"metric": "temperature"})
    assert response.status_code == 200
    body = response.json()
    assert body["metric"] == "temperature"
    assert [s["key"] for s in body["series"]] == [*ROOM_IDS, "aussen"]
    assert all(len(s["points"]) >= 3 * 12 for s in body["series"])


def test_endpoint_room_and_hours(api_sim: tuple[TestClient, Simulation]) -> None:
    client, own = api_sim
    run_with_sampling(own, 3)
    response = client.get(
        "/api/history", params={"metric": "humidity", "room_id": "kueche", "hours": 1}
    )
    assert response.status_code == 200
    series = response.json()["series"]
    assert [s["key"] for s in series] == ["kueche"]
    assert 11 <= len(series[0]["points"]) <= 13


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"metric": "druck"},
        {"metric": "temperature", "room_id": "keller"},
        {"metric": "temperature", "hours": 0},
        {"metric": "temperature", "hours": 169},
        {"metric": "temperature", "hours": "viele"},
    ],
)
def test_endpoint_rejects_invalid_parameters(api_sim, params: dict) -> None:
    client, _ = api_sim
    assert client.get("/api/history", params=params).status_code == 422


def test_real_app_samples_on_startup(client: TestClient) -> None:
    """The running app's loop samples history: the live endpoint returns every series."""
    response = client.get("/api/history", params={"metric": "power"})
    assert response.status_code == 200
    assert [s["key"] for s in response.json()["series"]] == ["verbrauch", "solar"]
