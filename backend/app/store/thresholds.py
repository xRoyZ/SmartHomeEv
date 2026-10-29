"""Persistence of the alert thresholds.

Implemented by the ticket "Implement alerts, acknowledgement and thresholds"; until then
nothing is loaded or stored and the defaults apply.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.engine import Simulation


def load(sim: Simulation) -> None:
    """Load the stored thresholds into ``sim.state.thresholds`` at startup."""


def on_reset(sim: Simulation) -> None:
    """Restore the stored thresholds after a simulation reset."""
