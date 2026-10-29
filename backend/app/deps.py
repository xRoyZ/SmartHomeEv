"""FastAPI dependencies."""

from __future__ import annotations

from fastapi import HTTPException, Request

from app.engine import Simulation


def get_sim(request: Request) -> Simulation:
    """The running simulation, created by the app's lifespan."""
    sim = getattr(request.app.state, "sim", None)
    if sim is None:
        raise HTTPException(status_code=503, detail="Simulation is not running")
    return sim
