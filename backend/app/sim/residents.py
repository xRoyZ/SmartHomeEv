"""The residents' daily routine: where they are and what they do.

Implemented by the ticket "Implement the residents' daily routine"; until then ``step`` changes nothing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.engine import Simulation


def step(sim: Simulation, dt_s: float) -> None:
    """Advance this part of the simulation by ``dt_s`` simulated seconds."""
