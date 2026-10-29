"""PATCH /api/devices/{device_id}: every kind, the WebSocket broadcast and rejections."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def paused(client: TestClient) -> Iterator[TestClient]:
    """The app with the simulation clock paused, so only our requests change devices."""
    client.app.state.sim.state.clock.paused = True
    yield client


def _device(client: TestClient, device_id: str) -> dict:
    devices = client.get("/api/state").json()["devices"]
    return next(d for d in devices if d["id"] == device_id)


@pytest.mark.parametrize(
    ("device_id", "body"),
    [
        ("wohnzimmer.licht", {"on": True, "brightness": 40}),
        ("wohnzimmer.heizung", {"target_c": 23.5}),
        ("wohnzimmer.rollladen", {"position": 70}),
        ("kueche.fenster", {"open": True}),
        ("wohnzimmer.tv", {"on": True}),
        ("kueche.backofen", {"on": True, "program": "Umluft 180 °C"}),
    ],
)
def test_each_kind_changes_as_requested(paused: TestClient, device_id: str, body: dict) -> None:
    response = paused.patch(f"/api/devices/{device_id}", json=body)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == device_id
    for key, value in body.items():
        assert data[key] == value
        assert _device(paused, device_id)[key] == value


def test_appliance_program_can_be_cleared(paused: TestClient) -> None:
    paused.patch("/api/devices/kueche.backofen", json={"program": "Grill"})
    response = paused.patch("/api/devices/kueche.backofen", json={"program": None})
    assert response.status_code == 200
    assert response.json()["program"] is None


def test_change_is_logged_as_user_activity(paused: TestClient) -> None:
    paused.patch("/api/devices/wohnzimmer.licht", json={"on": True, "brightness": 40})
    entry = paused.get("/api/state").json()["activity"][0]
    assert entry["source"] == "benutzer"
    assert "Licht" in entry["message"]


def test_change_arrives_in_websocket_state(client: TestClient) -> None:
    with client.websocket_connect("/ws") as ws:
        first = ws.receive_json()
        assert first["type"] == "state"
        response = client.patch(
            "/api/devices/wohnzimmer.licht", json={"on": True, "brightness": 40}
        )
        assert response.status_code == 200
        for _ in range(10):
            message = ws.receive_json()
            if message["type"] != "state":
                continue
            light = next(d for d in message["state"]["devices"] if d["id"] == "wohnzimmer.licht")
            if light["on"] and light["brightness"] == 40:
                break
        else:
            pytest.fail("no state message carried the change")


@pytest.mark.parametrize(
    ("device_id", "body"),
    [
        ("wohnzimmer.licht", {"position": 50}),  # field of another kind
        ("wohnzimmer.fenster", {"on": True}),
        ("wohnzimmer.heizung", {"brightness": 10}),
        ("wohnzimmer.tv", {"program": "Kaffee"}),
        ("wohnzimmer.licht", {"on": True, "target_c": 20}),  # one valid, one not
        ("wohnzimmer.licht", {"brightness": 101}),  # out of range
        ("wohnzimmer.rollladen", {"position": -1}),
        ("wohnzimmer.heizung", {"target_c": 31}),
        ("wohnzimmer.heizung", {"target_c": 4.9}),
        ("kueche.backofen", {"program": "Pizza 300 °C"}),  # unknown program
        ("kueche.backofen", {"on": True, "program": "Espresso"}),
        ("wohnzimmer.licht", {"on": None}),  # null for a non-nullable field
        ("wohnzimmer.licht", {"on": "vielleicht"}),  # wrong type
        ("wohnzimmer.licht", {"colour": "rot"}),  # unknown field
    ],
)
def test_invalid_update_is_rejected_and_changes_nothing(
    paused: TestClient, device_id: str, body: dict
) -> None:
    before_device = _device(paused, device_id)
    before_activity = paused.get("/api/state").json()["activity"]
    response = paused.patch(f"/api/devices/{device_id}", json=body)
    assert response.status_code == 422
    assert _device(paused, device_id) == before_device
    assert paused.get("/api/state").json()["activity"] == before_activity


def test_unknown_device_is_404(paused: TestClient) -> None:
    response = paused.patch("/api/devices/keller.licht", json={"on": True})
    assert response.status_code == 404
