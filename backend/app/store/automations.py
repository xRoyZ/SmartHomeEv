"""Persistence of the automations.

Implemented by the ticket "Implement automations engine, CRUD and persistence"; until
then nothing is loaded or stored.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.engine import Simulation


def load(sim: Simulation) -> None:
    """Load the stored automations into ``sim.state.automations`` at startup."""


def on_reset(sim: Simulation) -> None:
    """Restore the stored automations after a simulation reset."""
