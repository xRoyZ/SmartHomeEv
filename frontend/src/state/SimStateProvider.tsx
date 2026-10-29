import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { wsUrl } from "../api/client";
import type { ServerMessage, SimState } from "../types";

export interface SimStateValue {
  state: SimState | null;
  connected: boolean;
}

/** The live simulation state. Tests supply a value directly through this context. */
export const SimStateContext = createContext<SimStateValue>({ state: null, connected: false });

export function useSimState(): SimStateValue {
  return useContext(SimStateContext);
}

/** First retry after this many ms, doubled per failed attempt up to MAX_BACKOFF_MS. */
export const INITIAL_BACKOFF_MS = 500;
export const MAX_BACKOFF_MS = 10_000;
/** Keep-alive ping so idle proxies and phones in standby do not drop the socket silently. */
const PING_INTERVAL_MS = 20_000;

function parseMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const msg: unknown = JSON.parse(raw);
    if (msg && typeof msg === "object" && "type" in msg) {
      return msg as ServerMessage;
    }
  } catch {
    // Not JSON: not a message of the contract.
  }
  return null;
}

export interface SimStateProviderProps {
  children: ReactNode;
  /** Overrides the WebSocket URL derived from the API base (tests, embedding). */
  url?: string;
}

/**
 * Holds the one live SimState of the app. Opens the WebSocket, replaces the
 * state with every {"type":"state"} message, and reconnects with exponential
 * backoff — the server sends the full state again on every new connection, so a
 * reconnected (or reloaded) client is current at once.
 */
export function SimStateProvider({ children, url }: SimStateProviderProps) {
  const [value, setValue] = useState<SimStateValue>({ state: null, connected: false });

  useEffect(() => {
    const target = url ?? wsUrl();
    let socket: WebSocket | null = null;
    let disposed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const clearTimers = () => {
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      if (pingTimer !== undefined) clearInterval(pingTimer);
      retryTimer = undefined;
      pingTimer = undefined;
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimer !== undefined) return;
      const delay = Math.min(INITIAL_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      attempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(target);
      } catch {
        scheduleReconnect();
        return;
      }
      socket = ws;

      ws.onopen = () => {
        if (disposed || socket !== ws) return;
        attempt = 0;
        setValue((prev) => ({ ...prev, connected: true }));
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (disposed || socket !== ws) return;
        const msg = parseMessage(event.data);
        if (msg === null) return;
        if (msg.type === "state") {
          setValue({ state: msg.state, connected: true });
        } else if (msg.type === "error") {
          console.warn("Simulation hat eine Nachricht abgelehnt:", msg.detail);
        }
      };

      ws.onerror = () => {
        // The close event follows and schedules the reconnect.
      };

      ws.onclose = () => {
        if (socket !== ws) return;
        socket = null;
        if (pingTimer !== undefined) clearInterval(pingTimer);
        pingTimer = undefined;
        if (disposed) return;
        setValue((prev) => ({ ...prev, connected: false }));
        scheduleReconnect();
      };
    };

    // A phone waking up or a laptop back on the network retries at once
    // instead of waiting out the backoff.
    const retryNow = () => {
      if (disposed || socket !== null) return;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = undefined;
      attempt = 0;
      connect();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") retryNow();
    };
    window.addEventListener("online", retryNow);
    document.addEventListener("visibilitychange", onVisible);

    connect();

    return () => {
      disposed = true;
      clearTimers();
      window.removeEventListener("online", retryNow);
      document.removeEventListener("visibilitychange", onVisible);
      const ws = socket;
      socket = null;
      if (ws) {
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.onopen = null;
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          // Closing a socket mid-handshake makes browsers log an error; close it
          // as soon as it opens instead.
          ws.onopen = () => ws.close();
        }
      }
    };
  }, [url]);

  return <SimStateContext.Provider value={value}>{children}</SimStateContext.Provider>;
}
