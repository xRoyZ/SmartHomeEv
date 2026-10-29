"""WebSocket connection manager and the /ws message protocol.

Server -> client: ``{"type": "state", "state": SimState}`` on connect, after every loop
tick and after every mutation. Client -> server: only ``{"type": "ping"}``, answered with
``{"type": "pong"}``. A message larger than ``MAX_MESSAGE_BYTES``, one that is not JSON
or one of an unknown type is answered with ``{"type": "error", "detail": str}`` and
otherwise ignored: the connection stays open and the state is untouched.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

MAX_MESSAGE_BYTES = 65536
SEND_TIMEOUT_S = 5.0


class ConnectionManager:
    """The open WebSocket clients of one simulation; sends are serialized per client."""

    def __init__(self) -> None:
        self._clients: dict[WebSocket, asyncio.Lock] = {}

    def __len__(self) -> int:
        return len(self._clients)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients[websocket] = asyncio.Lock()

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.pop(websocket, None)

    async def send_text(self, websocket: WebSocket, text: str) -> bool:
        """Send to one client; a client that cannot be reached is dropped (returns False)."""
        lock = self._clients.get(websocket)
        if lock is None:
            return False
        try:
            async with lock:
                await asyncio.wait_for(websocket.send_text(text), timeout=SEND_TIMEOUT_S)
        except Exception as exc:
            logger.info("dropping websocket client: %s", type(exc).__name__)
            self.disconnect(websocket)
            return False
        return True

    async def send_json(self, websocket: WebSocket, payload: dict[str, Any]) -> bool:
        return await self.send_text(websocket, json.dumps(payload))

    async def broadcast_text(self, text: str) -> None:
        clients = list(self._clients)
        if clients:
            await asyncio.gather(*(self.send_text(ws, text) for ws in clients))


def state_message(state_json: dict[str, Any]) -> str:
    return json.dumps({"type": "state", "state": state_json})


def error_message(detail: str) -> dict[str, str]:
    return {"type": "error", "detail": detail}


def handle_client_message(raw: str | bytes | None) -> dict[str, str]:
    """The reply to one client message. Never raises and never touches the state."""
    if raw is None:
        return error_message("Leere Nachricht")
    size = len(raw) if isinstance(raw, bytes) else len(raw.encode("utf-8"))
    if size > MAX_MESSAGE_BYTES:
        return error_message(f"Nachricht zu groß (höchstens {MAX_MESSAGE_BYTES} Bytes)")
    try:
        text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        message = json.loads(text)
    except (UnicodeDecodeError, ValueError, RecursionError):
        return error_message("Nachricht ist kein gültiges JSON")
    if not isinstance(message, dict) or not isinstance(message.get("type"), str):
        return error_message("Nachricht ohne Typ")
    if message["type"] == "ping":
        return {"type": "pong"}
    return error_message("Unbekannter Nachrichtentyp")
