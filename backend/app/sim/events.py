"""Triggerable events (Fenster vergessen, Wasserschaden, Rauch, Stromspitze, Heizungsausfall).

Implemented by the ticket "Implement triggerable events"; until then ``step`` changes
nothing and ``trigger`` registers nothing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.sim.state import ActiveEvent, EventType

if TYPE_CHECKING:
    from app.engine import Simulation


def step(sim: Simulation, dt_s: float) -> None:
    """Advance the active events by ``dt_s`` simulated seconds and end expired ones."""


def trigger(sim: Simulation, type: EventType) -> ActiveEvent:
    """Start an event of ``type`` and return it as it appears in ``state.active_events``."""
    return ActiveEvent(type=type, room_id=None, started_at=sim.state.clock.sim_time)
