"""The automations engine: evaluates conditions and fires actions.

Implemented by the ticket "Implement automations engine, CRUD and persistence"; until
then ``step`` fires nothing and there are no default automations.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.sim.state import AutomationIn

if TYPE_CHECKING:
    from app.engine import Simulation


def step(sim: Simulation, dt_s: float) -> None:
    """Fire every enabled automation whose condition has become true."""


def default_automations() -> list[AutomationIn]:
    """The automations a fresh or reset simulation starts with."""
    return []
