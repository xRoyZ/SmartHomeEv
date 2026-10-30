import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../api/client";
import { SimStateContext } from "../state/SimStateProvider";
import type { Alert, Device, Room, RoomId, SimState } from "../types";
import { OverviewPage } from "./OverviewPage";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    setSpeed: vi.fn(),
    pauseSimulation: vi.fn(),
    resumeSimulation: vi.fn(),
    resetSimulation: vi.fn(),
    acknowledgeAlert: vi.fn(),
  };
});

const setSpeed = vi.mocked(client.setSpeed);
const pauseSimulation = vi.mocked(client.pauseSimulation);
const acknowledgeAlert = vi.mocked(client.acknowledgeAlert);

const ROOMS: [RoomId, string][] = [
  ["wohnzimmer", "Wohnzimmer"],
  ["kueche", "Küche"],
  ["schlafzimmer", "Schlafzimmer"],
  ["kinderzimmer", "Kinderzimmer"],
  ["bad", "Bad"],
  ["flur", "Flur"],
];

function room(id: RoomId, name: string, extra: Partial<Room> = {}): Room {
  return {
    id,
    name,
    temperature_c: 20.5,
    humidity_pct: 45,
    co2_ppm: 700,
    light_lux: 200,
    motion: false,
    last_motion_at: null,
    activity: "none",
    smoke: null,
    leak: null,
    door_open: id === "flur" ? false : null,
    ...extra,
  };
}

function devicesFor(id: RoomId): Device[] {
  return [
    { id: `${id}.licht`, room_id: id, name: "Licht", kind: "light", power_w: 0, on: id === "wohnzimmer", brightness: id === "wohnzimmer" ? 60 : 0 },
    { id: `${id}.fenster`, room_id: id, name: "Fenster", kind: "window", power_w: 0, open: id === "kueche" },
  ];
}

const CO2_ALERT: Alert = {
  id: "co2_hoch:kinderzimmer",
  kind: "co2_hoch",
  room_id: "kinderzimmer",
  message: "CO2 1.420 ppm – Kinderzimmer",
  severity: "warnung",
  raised_at: "2026-01-14T07:21:00",
  active: true,
  acknowledged: false,
};

function makeState(extra: Partial<SimState> = {}): SimState {
  return {
    clock: { sim_time: "2026-01-14T07:42:00", speed: 60, paused: false },
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
    outdoor: { temperature_c: 6.2, weather: "bewoelkt", sun_elevation_deg: 12, daylight: 0.5, sun_up: true },
    solar: { production_w: 1800, consumption_w: 2400, balance_w: -600 },
    rooms: ROOMS.map(([id, name]) => room(id, name, id === "kueche" ? { motion: true } : {})),
    devices: ROOMS.flatMap(([id]) => devicesFor(id)),
    residents: [],
    alerts: [CO2_ALERT],
    thresholds: { room_min_c: 18, room_max_c: 26, co2_max_ppm: 1200, power_max_w: 6000 },
    automations: [],
    activity: [{ sim_time: "2026-01-14T07:40:00", message: "<b>Licht aus</b> – Flur", source: "automation" }],
    active_events: [],
    base_load_w: 150,
    extra_load_w: 0,
    ...extra,
  };
}

function renderPage(state: SimState | null) {
  return render(
    <SimStateContext.Provider value={{ state, connected: true }}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    </SimStateContext.Provider>,
  );
}

const plan = () => document.querySelector('[data-od-id="house-plan"]') as HTMLElement;

describe("OverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state while no state has arrived", () => {
    renderPage(null);
    expect(screen.getByRole("status")).toHaveTextContent("Hausdaten werden geladen");
  });

  it("renders all six rooms, the outdoor values and the energy figures", () => {
    renderPage(makeState());
    for (const [, name] of ROOMS) {
      expect(within(plan()).getByText(name)).toBeInTheDocument();
    }
    const outdoor = document.querySelector('[data-od-id="outdoor-weather"]') as HTMLElement;
    expect(outdoor).toHaveTextContent("6,2");
    expect(outdoor).toHaveTextContent("Bewölkt");
    const energy = document.querySelector('[data-od-id="energy-ring"]') as HTMLElement;
    expect(energy).toHaveTextContent("Verbrauch2,4 kW");
    expect(energy).toHaveTextContent("Solar1,8 kW");
    expect(energy).toHaveTextContent("Netzbezug0,6 kW");
    expect(document.querySelector('[data-od-id="sim-clock"]')).toHaveTextContent("Mi07:42");
    expect(document.querySelector('[data-od-id="clock-band"]')).toHaveTextContent("Winter");
  });

  it("names a surplus Einspeisung", () => {
    renderPage(makeState({ solar: { production_w: 3000, consumption_w: 1000, balance_w: 2000 } }));
    expect(document.querySelector('[data-od-id="energy-ring"]')).toHaveTextContent("Einspeisung2,0 kW");
  });

  it("links each room to its route and shows light, window and motion", () => {
    renderPage(makeState());
    const living = within(plan()).getByRole("link", { name: /Wohnzimmer/ });
    expect(living).toHaveAttribute("href", "/raum/wohnzimmer");
    expect(living).toHaveTextContent("Licht 60 %");
    const kitchen = within(plan()).getByRole("link", { name: /Küche/ });
    expect(kitchen).toHaveTextContent("Fenster offen");
    expect(kitchen).toHaveTextContent("Bewegung");
  });

  it("marks the room of an active alert and lists the alert", async () => {
    acknowledgeAlert.mockResolvedValue({ ...CO2_ALERT, acknowledged: true });
    renderPage(makeState());
    const kids = within(plan()).getByRole("link", { name: /Kinderzimmer/ });
    expect(kids).toHaveClass("is-alarm");
    expect(kids).toHaveTextContent("CO2 zu hoch");
    expect(within(plan()).getByRole("link", { name: /Bad/ })).not.toHaveClass("is-alarm");

    const alerts = document.querySelector('[data-od-id="active-alerts"]') as HTMLElement;
    expect(within(alerts).getByRole("link", { name: "Alle Alarme" })).toHaveAttribute("href", "/alarme");
    fireEvent.click(within(alerts).getByRole("button", { name: "Bestätigen" }));
    await waitFor(() => expect(acknowledgeAlert).toHaveBeenCalledWith("co2_hoch:kinderzimmer"));
  });

  it("shows the calm empty state without active alerts", () => {
    renderPage(makeState({ alerts: [{ ...CO2_ALERT, active: false }] }));
    expect(screen.getByText("Alles ruhig")).toBeInTheDocument();
    expect(within(plan()).getByRole("link", { name: /Kinderzimmer/ })).not.toHaveClass("is-alarm");
  });

  it("renders activity messages as literal text", () => {
    renderPage(makeState());
    const line = document.querySelector('[data-od-id="activity-latest"]') as HTMLElement;
    expect(line).toHaveTextContent("07:40");
    expect(line).toHaveTextContent("<b>Licht aus</b> – Flur");
    expect(line.querySelector("b")).toBeNull();
  });

  it("the 1440x segment calls setSpeed(1440) and pause calls pauseSimulation()", async () => {
    setSpeed.mockResolvedValue({ sim_time: "2026-01-14T07:42:00", speed: 1440, paused: false });
    pauseSimulation.mockResolvedValue({ sim_time: "2026-01-14T07:42:00", speed: 60, paused: true });
    renderPage(makeState());
    const seg = document.querySelector('[data-od-id="speed-segments"]') as HTMLElement;
    expect(within(seg).getByRole("button", { name: "60x" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(seg).getByRole("button", { name: "1440x" }));
    await waitFor(() => expect(setSpeed).toHaveBeenCalledWith(1440));
    fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(pauseSimulation).toHaveBeenCalledTimes(1));
  });
});
