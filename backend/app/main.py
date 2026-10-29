"""FastAPI application: startup, CORS, routers, /api/health, /api/state and /ws."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app import db
from app.api import alerts as alerts_api
from app.api import automations as automations_api
from app.api import devices as devices_api
from app.api import events as events_api
from app.api import history as history_api
from app.api import simulation as simulation_api
from app.deps import get_sim
from app.engine import Simulation, run_loop
from app.sim.state import Settings, SimState
from app.store import automations as automations_store
from app.store import settings as settings_store
from app.store import thresholds as thresholds_store
from app.ws import handle_client_message, state_message

logger = logging.getLogger(__name__)

# Origins a browser may call the API from without SMARTHOME_CORS_ORIGIN: this machine
# and the private LAN ranges (a phone opening the laptop's IP), on any port.
LOCAL_ORIGIN_REGEX = (
    r"https?://("
    r"localhost|127\.0\.0\.1"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r")(:\d{1,5})?"
)


def cors_origins() -> list[str]:
    """SMARTHOME_CORS_ORIGIN (the web service's origin), comma-separated values allowed."""
    raw = os.environ.get("SMARTHOME_CORS_ORIGIN", "")
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startup per contract: connect, schema, settings, simulation, stores, loop."""
    path = db.db_path_from_env()
    conn = db.connect(path)
    loop_task: asyncio.Task | None = None
    try:
        db.init_schema(conn)
        settings = settings_store.load(conn) or Settings()
        sim = Simulation(settings, conn)
        automations_store.load(sim)
        thresholds_store.load(sim)
        app.state.sim = sim
        loop_task = asyncio.create_task(run_loop(sim))
        logger.info("simulation started (database %s)", path)
        yield
    finally:
        if loop_task is not None:
            loop_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await loop_task
        app.state.sim = None
        conn.close()


class CatchAllMiddleware:
    """Turn an unhandled exception into a JSON 500 INSIDE the CORS layer.

    Starlette's own handler for ``Exception`` sits outside every middleware, so its 500
    would reach the browser without CORS headers and look like "backend unreachable".
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception:
            logger.exception("unhandled error on %s %s", scope.get("method"), scope.get("path"))
            if started:
                raise
            response = JSONResponse(status_code=500, content={"detail": "Internal Server Error"})
            await response(scope, receive, send)


app = FastAPI(title="Smart-Home-Simulator", version="1.0.0", lifespan=lifespan)

app.add_middleware(CatchAllMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_origin_regex=LOCAL_ORIGIN_REGEX,
    # No cookies or accounts in this product: credentials are never needed.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for _router in (
    devices_api.router,
    events_api.router,
    alerts_api.router,
    automations_api.router,
    history_api.router,
    simulation_api.router,
):
    app.include_router(_router)


@app.get("/api/health")
async def health(sim: Simulation = Depends(get_sim)) -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/state", response_model=SimState)
async def get_state(sim: Simulation = Depends(get_sim)) -> SimState:
    return sim.state


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    sim: Simulation | None = getattr(websocket.app.state, "sim", None)
    if sim is None:
        await websocket.close(code=1013)
        return
    await sim.clients.connect(websocket)
    try:
        if not await sim.clients.send_text(websocket, state_message(sim.state_json())):
            return
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            raw = message.get("text")
            if raw is None:
                raw = message.get("bytes")
            reply = handle_client_message(raw)
            if not await sim.clients.send_json(websocket, reply):
                break
    except WebSocketDisconnect:
        pass
    finally:
        sim.clients.disconnect(websocket)
