import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiBase, updateDevice, wsUrl } from "./api/client";
import { AppRoutes } from "./App";
import { SimStateContext, SimStateProvider, useSimState } from "./state/SimStateProvider";
import type { SimState } from "./types";

function makeState(simTime: string): SimState {
  return {
    clock: { sim_time: simTime, speed: 60, paused: false },
    settings: {
      seed: 42,
      start_time: "2026-01-14T06:00:00",
      weather_mode: "auto",
      season: "winter",
      behaviour: "standard",
      speed: 60,
      adults: 2,
      children: 1,
    },
    outdoor: { temperature_c: 2, weather: "bewoelkt", sun_elevation_deg: 10, daylight: 0.4, sun_up: true },
    solar: { production_w: 300, consumption_w: 800, balance_w: -500 },
    rooms: [],
    devices: [],
    residents: [],
    alerts: [],
    thresholds: { room_min_c: 18, room_max_c: 26, co2_max_ppm: 1200, power_max_w: 6000 },
    automations: [],
    activity: [],
    active_events: [],
    base_load_w: 150,
    extra_load_w: 0,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderAt(path: string, connected: boolean, state: SimState | null = null) {
  return render(
    <SimStateContext.Provider value={{ state, connected }}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </SimStateContext.Provider>,
  );
}

describe("routes", () => {
  const routes: [string, string][] = [
    ["/", "overview"],
    ["/raum/kueche", "room"],
    ["/automationen", "automations"],
    ["/alarme", "alerts"],
    ["/verlauf", "history"],
    ["/simulation", "settings"],
  ];

  it.each(routes)("%s renders its page inside AppFrame", (path, page) => {
    const { container } = renderAt(path, true, makeState("2026-01-14T07:42:00"));
    const frame = screen.getByTestId("app-frame");
    expect(frame.querySelector(`[data-page="${page}"]`)).not.toBeNull();
    expect(container.querySelectorAll("[data-page]")).toHaveLength(1);
  });

  it.each([
    ["/warnungen", "/alarme", "alerts", "Alarme"],
    ["/einstellungen", "/simulation", "settings", "Simulation"],
  ])("%s redirects to %s and marks its nav entry current", (oldPath, newPath, page, navLabel) => {
    renderAt(oldPath, true, makeState("2026-01-14T07:42:00"));
    expect(screen.getByTestId("location")).toHaveTextContent(newPath);
    expect(screen.getByTestId("app-frame").querySelector(`[data-page="${page}"]`)).not.toBeNull();
    const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
    const link = within(nav).getByRole("link", { name: navLabel });
    expect(link).toHaveAttribute("href", newPath);
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("the header alert badge leads to /alarme", () => {
    renderAt("/", true, makeState("2026-01-14T07:42:00"));
    const hrefs = within(screen.getByTestId("app-frame"))
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/alarme");
    expect(hrefs).not.toContain("/warnungen");
    expect(hrefs).not.toContain("/einstellungen");
  });

  it("shows the disconnected notice only while not connected", () => {
    renderAt("/", false, makeState("2026-01-14T07:42:00"));
    const notice = screen.getByTestId("connection-notice");
    expect(within(notice).getByText(/Verbindung zur Simulation unterbrochen/)).toBeInTheDocument();
    cleanup();
    renderAt("/", true, makeState("2026-01-14T07:42:00"));
    expect(screen.queryByTestId("connection-notice")).toBeNull();
  });

  it("an unknown path stays inside the frame and links back to the overview", () => {
    renderAt("/gibt-es-nicht", true);
    const frame = screen.getByTestId("app-frame");
    expect(within(frame).getByRole("link", { name: "Zur Übersicht" })).toHaveAttribute("href", "/");
  });
});

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back to the page's host on port 8000 and derives the ws URL from it", () => {
    vi.stubEnv("VITE_API_BASE", "");
    expect(apiBase()).toBe(`${window.location.protocol}//${window.location.hostname}:8000`);
    expect(wsUrl()).toBe(`ws://${window.location.hostname}:8000/ws`);
  });

  it("uses VITE_API_BASE when it is set", () => {
    vi.stubEnv("VITE_API_BASE", "http://192.168.1.20:8000/");
    expect(apiBase()).toBe("http://192.168.1.20:8000");
    expect(wsUrl()).toBe("ws://192.168.1.20:8000/ws");
  });

  it("throws ApiError with status and detail on a non-2xx answer", async () => {
    vi.stubEnv("VITE_API_BASE", "http://api.test");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: "Gerät unbekannt" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const error = await updateDevice("bad.nichts", { on: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, detail: "Gerät unbekannt" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/devices/bad.nichts",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ on: true }) }),
    );
  });
});

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  serverOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  serverSend(payload: unknown) {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  serverClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }
}

function Probe() {
  const { state, connected } = useSimState();
  return (
    <div>
      <span data-testid="connected">{connected ? "ja" : "nein"}</span>
      <span data-testid="sim-time">{state?.clock.sim_time ?? "keine"}</span>
    </div>
  );
}

describe("SimStateProvider", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("applies every state message from the WebSocket", () => {
    render(
      <SimStateProvider url="ws://test.invalid/ws">
        <Probe />
      </SimStateProvider>,
    );
    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe("ws://test.invalid/ws");
    expect(screen.getByTestId("connected")).toHaveTextContent("nein");

    act(() => {
      ws.serverOpen();
      ws.serverSend({ type: "state", state: makeState("2026-01-14T07:42:00") });
    });
    expect(screen.getByTestId("connected")).toHaveTextContent("ja");
    expect(screen.getByTestId("sim-time")).toHaveTextContent("2026-01-14T07:42:00");

    act(() => {
      ws.serverSend({ type: "state", state: makeState("2026-01-14T07:43:00") });
    });
    expect(screen.getByTestId("sim-time")).toHaveTextContent("2026-01-14T07:43:00");
  });

  it("ignores non-JSON, pong and unknown messages", () => {
    render(
      <SimStateProvider url="ws://test.invalid/ws">
        <Probe />
      </SimStateProvider>,
    );
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.serverOpen();
      ws.serverSend({ type: "state", state: makeState("2026-01-14T07:42:00") });
      ws.serverSend("kein json");
      ws.serverSend({ type: "pong" });
      ws.serverSend({ type: "unbekannt" });
    });
    expect(screen.getByTestId("sim-time")).toHaveTextContent("2026-01-14T07:42:00");
  });

  it("reconnects with backoff and takes the full state of the new connection", () => {
    vi.useFakeTimers();
    render(
      <SimStateProvider url="ws://test.invalid/ws">
        <Probe />
      </SimStateProvider>,
    );
    const first = MockWebSocket.instances[0];
    act(() => {
      first.serverOpen();
      first.serverSend({ type: "state", state: makeState("2026-01-14T07:42:00") });
    });

    act(() => {
      first.serverClose();
    });
    expect(screen.getByTestId("connected")).toHaveTextContent("nein");
    // The last known state stays visible while the notice says it is stale.
    expect(screen.getByTestId("sim-time")).toHaveTextContent("2026-01-14T07:42:00");
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    const second = MockWebSocket.instances[1];

    // A failed attempt waits longer before the next one.
    act(() => {
      second.serverClose();
      vi.advanceTimersByTime(600);
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(MockWebSocket.instances).toHaveLength(3);

    const third = MockWebSocket.instances[2];
    act(() => {
      third.serverOpen();
      third.serverSend({ type: "state", state: makeState("2026-01-14T09:00:00") });
    });
    expect(screen.getByTestId("connected")).toHaveTextContent("ja");
    expect(screen.getByTestId("sim-time")).toHaveTextContent("2026-01-14T09:00:00");
  });

  it("closes the socket and stops reconnecting on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <SimStateProvider url="ws://test.invalid/ws">
        <Probe />
      </SimStateProvider>,
    );
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.serverOpen();
    });
    unmount();
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
