import type {
  ActiveEvent,
  Alert,
  Automation,
  AutomationIn,
  Clock,
  Device,
  DeviceUpdate,
  EventType,
  HistoryMetric,
  HistoryResponse,
  RoomId,
  Settings,
  SettingsUpdate,
  SimState,
  Speed,
  Thresholds,
} from "../types";

/** Thrown for every non-2xx answer and for a request that never reached the API. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * The API origin: VITE_API_BASE when the build sets it, otherwise the host the
 * page was loaded from on port 8000 — so a phone on the LAN that opened
 * http://192.168.x.y:5173 talks to http://192.168.x.y:8000.
 */
export function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE as string | undefined;
  // An unresolved run-contract placeholder ("${service:...}") is no address.
  if (configured && configured.trim() !== "" && !configured.includes("${")) {
    return configured.trim().replace(/\/+$/, "");
  }
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

/** The WebSocket URL: the API base with http->ws (https->wss) plus "/ws". */
export function wsUrl(): string {
  return `${apiBase().replace(/^http/, "ws")}/ws`;
}

function detailOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const parts = detail.map((d) =>
        d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : String(d),
      );
      if (parts.length > 0) return parts.join("; ");
    }
  }
  return fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Keine Verbindung zur Simulation");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let parsed: unknown = undefined;
  const text = await response.text();
  if (text !== "") {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, detailOf(parsed, `Anfrage fehlgeschlagen (${response.status})`));
  }
  return parsed as T;
}

export function getState(): Promise<SimState> {
  return request<SimState>("GET", "/api/state");
}

export function updateDevice(id: string, u: DeviceUpdate): Promise<Device> {
  return request<Device>("PATCH", `/api/devices/${encodeURIComponent(id)}`, u);
}

export function triggerEvent(type: EventType): Promise<ActiveEvent> {
  return request<ActiveEvent>("POST", "/api/events", { type });
}

export function getAlerts(): Promise<Alert[]> {
  return request<Alert[]>("GET", "/api/alerts");
}

export function acknowledgeAlert(alertId: string): Promise<Alert> {
  return request<Alert>("POST", `/api/alerts/${encodeURIComponent(alertId)}/acknowledge`);
}

export function getThresholds(): Promise<Thresholds> {
  return request<Thresholds>("GET", "/api/thresholds");
}

export function putThresholds(t: Thresholds): Promise<Thresholds> {
  return request<Thresholds>("PUT", "/api/thresholds", t);
}

export function listAutomations(): Promise<Automation[]> {
  return request<Automation[]>("GET", "/api/automations");
}

export function createAutomation(a: AutomationIn): Promise<Automation> {
  return request<Automation>("POST", "/api/automations", a);
}

export function updateAutomation(id: number, a: AutomationIn): Promise<Automation> {
  return request<Automation>("PUT", `/api/automations/${id}`, a);
}

export function setAutomationEnabled(id: number, enabled: boolean): Promise<Automation> {
  return request<Automation>("PATCH", `/api/automations/${id}/enabled`, { enabled });
}

export function deleteAutomation(id: number): Promise<void> {
  return request<void>("DELETE", `/api/automations/${id}`);
}

export function getHistory(metric: HistoryMetric, roomId?: RoomId, hours?: number): Promise<HistoryResponse> {
  const params = new URLSearchParams({ metric });
  if (roomId !== undefined) params.set("room_id", roomId);
  if (hours !== undefined) params.set("hours", String(hours));
  return request<HistoryResponse>("GET", `/api/history?${params.toString()}`);
}

export function pauseSimulation(): Promise<Clock> {
  return request<Clock>("POST", "/api/simulation/pause");
}

export function resumeSimulation(): Promise<Clock> {
  return request<Clock>("POST", "/api/simulation/resume");
}

export function setSpeed(speed: Speed): Promise<Clock> {
  return request<Clock>("PUT", "/api/simulation/speed", { speed });
}

export function getSettings(): Promise<Settings> {
  return request<Settings>("GET", "/api/simulation/settings");
}

export function updateSettings(u: SettingsUpdate): Promise<Settings> {
  return request<Settings>("PUT", "/api/simulation/settings", u);
}

export function resetSimulation(): Promise<SimState> {
  return request<SimState>("POST", "/api/simulation/reset");
}
