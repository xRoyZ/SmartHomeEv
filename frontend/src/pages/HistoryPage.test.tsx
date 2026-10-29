import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../api/client";
import { SimStateContext } from "../state/SimStateProvider";
import type { HistoryMetric, HistoryResponse, Room, RoomId, SimState } from "../types";
import { HISTORY_REFRESH_MIN_MS, HistoryPage } from "./HistoryPage";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, getHistory: vi.fn() };
});

const getHistory = vi.mocked(client.getHistory);

function room(id: RoomId, name: string): Room {
  return {
    id,
    name,
    temperature_c: 21,
    humidity_pct: 48,
    co2_ppm: 820,
    light_lux: 300,
    motion: false,
    last_motion_at: null,
    activity: "none",
    smoke: null,
    leak: null,
    door_open: null,
  };
}

function makeState(simTime = "2026-01-14T07:42:00"): SimState {
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
    solar: { production_w: 1800, consumption_w: 2400, balance_w: -600 },
    rooms: [room("wohnzimmer", "Wohnzimmer"), room("bad", "Bad")],
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

const pts = (a: number, b: number) => [
  { t: "2026-01-14T07:00:00", v: a },
  { t: "2026-01-14T07:40:00", v: b },
];

function response(metric: HistoryMetric): HistoryResponse {
  const base = { metric, from_time: "2026-01-13T07:42:00", to_time: "2026-01-14T07:42:00" };
  if (metric === "power") {
    return {
      ...base,
      series: [
        { key: "verbrauch", label: "Verbrauch", points: pts(2000, 2400) },
        { key: "solar", label: "Solar", points: pts(1500, 1800) },
      ],
    };
  }
  return {
    ...base,
    series: [
      { key: "aussen", label: "Außen", points: pts(1.5, 2) },
      { key: "wohnzimmer", label: "Wohnzimmer", points: pts(20.5, 21) },
      { key: "bad", label: "Bad", points: pts(21.2, 21.5) },
    ],
  };
}

function renderPage(state: SimState | null = makeState()) {
  const ui = (s: SimState | null) => (
    <SimStateContext.Provider value={{ state: s, connected: true }}>
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    </SimStateContext.Provider>
  );
  const utils = render(ui(state));
  return { ...utils, update: (s: SimState) => utils.rerender(ui(s)) };
}

function region(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-od-id="${id}"]`);
  if (!el) throw new Error(`region ${id} missing`);
  return el;
}

beforeEach(() => {
  getHistory.mockReset();
  getHistory.mockImplementation(async (metric) => response(metric));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HistoryPage", () => {
  it("loads the 24 h temperature on mount and shows the series with their labels", async () => {
    const { container } = renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Wie das Haus den letzten Tag erlebt hat" })).toBeInTheDocument();
    await waitFor(() => expect(getHistory).toHaveBeenCalledWith("temperature", undefined, 24));
    const chart = region(container, "history-chart");
    expect(await within(chart).findByRole("img")).toBeInTheDocument();
    expect(within(chart).getByText("Außen")).toBeInTheDocument();
    expect(within(chart).getByText("Wohnzimmer")).toBeInTheDocument();
    expect(within(chart).getByText("Bad")).toBeInTheDocument();
    expect(within(chart).getByText("Untergrenze")).toBeInTheDocument();
  });

  it("switching the metric requests it and shows its series; power hides the room choice", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(getHistory).toHaveBeenCalledTimes(1));
    const filters = region(container, "history-filters");

    fireEvent.click(within(filters).getByRole("button", { name: "CO2" }));
    await waitFor(() => expect(getHistory).toHaveBeenLastCalledWith("co2", undefined, 24));
    expect(await within(region(container, "history-chart")).findByText("Grenze")).toBeInTheDocument();

    fireEvent.click(within(filters).getByRole("button", { name: "Verbrauch vs. Solar" }));
    await waitFor(() => expect(getHistory).toHaveBeenLastCalledWith("power", undefined, 24));
    const chart = region(container, "history-chart");
    expect(await within(chart).findByText("Verbrauch")).toBeInTheDocument();
    expect(within(chart).getByText("Solar")).toBeInTheDocument();
    expect(within(filters).queryByRole("button", { name: "Alle Räume" })).toBeNull();
  });

  it("choosing a room requests only that room", async () => {
    const { container } = renderPage();
    await waitFor(() => expect(getHistory).toHaveBeenCalledTimes(1));
    fireEvent.click(within(region(container, "history-filters")).getByRole("button", { name: "Bad" }));
    await waitFor(() => expect(getHistory).toHaveBeenLastCalledWith("temperature", "bad", 24));
  });

  it("shows an empty state when no point is recorded yet", async () => {
    getHistory.mockResolvedValue({
      ...response("temperature"),
      series: [{ key: "aussen", label: "Außen", points: [] }],
    });
    const { container } = renderPage();
    expect(await within(region(container, "history-chart")).findByText("Noch keine Messwerte")).toBeInTheDocument();
  });

  it("shows a failed request as a German error", async () => {
    getHistory.mockRejectedValue(new client.ApiError(500, "Internal Server Error"));
    const { container } = renderPage();
    expect(await within(region(container, "history-chart")).findByText("Verlauf nicht verfügbar")).toBeInTheDocument();
  });

  it("refreshes when the simulation clock moves on, at most every 5 real seconds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    const { update } = renderPage();
    await waitFor(() => expect(getHistory).toHaveBeenCalledTimes(1));

    await act(async () => update(makeState("2026-01-14T07:43:00")));
    expect(getHistory).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(Date.now() + HISTORY_REFRESH_MIN_MS));
    await act(async () => update(makeState("2026-01-14T07:44:00")));
    await waitFor(() => expect(getHistory).toHaveBeenCalledTimes(2));
  });
});
