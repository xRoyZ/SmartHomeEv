"""The simulation object, its deterministic clock advance and the real-time loop."""

from __future__ import annotations

import asyncio
import logging
import random
import sqlite3
import time
from datetime import timedelta

from app import history
from app.sim import alerts, automations, environment, events, physics, power, residents
from app.sim.state import (
    MAX_ACTIVITY_ENTRIES,
    ActivityEntry,
    Settings,
    SimState,
    build_initial_state,
)
from app.store import automations as automations_store
from app.store import thresholds as thresholds_store
from app.ws import ConnectionManager, state_message

logger = logging.getLogger(__name__)

MAX_SUBSTEP_S = 60.0
TICK_REAL_S = 0.5

# The order every substep runs the sim modules in (contract order).
STEP_MODULES = (environment, residents, events, automations, physics, power, alerts)


class Simulation:
    """The one running simulation: state, its random source, the database and the clients.

    ``rng`` is the ONLY source of randomness the simulation may use, so that the same
    seed and the same inputs reproduce the same values.
    """

    def __init__(self, settings: Settings, conn: sqlite3.Connection) -> None:
        self.conn = conn
        self.lock = asyncio.Lock()
        self.state: SimState = build_initial_state(settings)
        self.rng = random.Random(self.state.settings.seed)
        self.clients = ConnectionManager()

    def advance(self, dt_s: float) -> None:
        """Advance simulation time by ``dt_s`` seconds in substeps of at most 60 s.

        Each substep moves the clock forward and then runs every sim module's ``step``
        in contract order. Synchronous and deterministic.
        """
        remaining = float(dt_s)
        while remaining > 1e-9:
            step_s = min(MAX_SUBSTEP_S, remaining)
            self.state.clock.sim_time += timedelta(seconds=step_s)
            for module in STEP_MODULES:
                module.step(self, step_s)
            remaining -= step_s

    def log(self, message: str, source: str) -> None:
        """Add an entry to the activity log (newest first, at most 200 entries)."""
        entry = ActivityEntry(sim_time=self.state.clock.sim_time, message=message, source=source)
        self.state.activity.insert(0, entry)
        del self.state.activity[MAX_ACTIVITY_ENTRIES:]

    def state_json(self) -> dict:
        return self.state.model_dump(mode="json")

    async def broadcast(self) -> None:
        """Send the current state to every connected WebSocket client."""
        if len(self.clients) == 0:
            return
        await self.clients.broadcast_text(state_message(self.state_json()))

    def reset(self) -> None:
        """Rebuild the initial state from the current settings and reseed ``rng``."""
        self.state = build_initial_state(self.state.settings)
        self.rng = random.Random(self.state.settings.seed)
        automations_store.on_reset(self)
        thresholds_store.on_reset(self)
        history.on_reset(self)


def tick(sim: Simulation) -> None:
    """One loop tick: advance by 0.5 real seconds times the speed unless paused."""
    if not sim.state.clock.paused:
        sim.advance(TICK_REAL_S * sim.state.clock.speed)
    history.sample(sim)


async def run_loop(sim: Simulation) -> None:
    """Every 0.5 real seconds: advance (unless paused), sample history, broadcast.

    A failing tick is logged and the loop carries on; only cancellation stops it.
    """
    next_tick = time.monotonic()
    while True:
        try:
            async with sim.lock:
                tick(sim)
            await sim.broadcast()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("simulation tick failed")
        next_tick += TICK_REAL_S
        delay = next_tick - time.monotonic()
        if delay < 0:
            # Fell behind (e.g. a slow tick): continue from now instead of catching up.
            next_tick = time.monotonic()
            delay = 0
        await asyncio.sleep(delay)
