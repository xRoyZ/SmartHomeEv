import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { acknowledgeAlert, ApiError, putThresholds } from "../api/client";
import { SimStateContext } from "../state/SimStateProvider";
import type { Alert, Room, SimState, Thresholds } from "../types";
import { AlertsPage } from "./AlertsPage";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    acknowledgeAlert: vi.fn(),
    putThresholds: vi.fn(),
  };
});

function room(id: Room["id"], name: string, temperature_c = 20, co2_ppm = 600): Room {
  return {
    id,
    name,
    temperature_c,
    humidity_pct: 45,
    co2_ppm,
    light_lux: 200,
    motion: false,
    last_motion_at: null,
    activity: "none",
    smoke: null,
    leak: null,
    door_open: null,
  };
}

const ROOMS: Room[] = [room("kueche", "Küche", 21), room("kinderzimmer", "Kinderzimmer", 20, 1420), room("flur", "Flur", 18.9)];

const XSS = "<img src=x onerror=alert(1)>";

function alert(over: Partial<Alert> = {}): Alert {
  return {
    id: "co2_hoch:kinderzimmer",
    kind: "co2_hoch",
    room_id: "kinderzimmer",
    message: "Grenze 1.200 ppm überschritten",
    severity: "warnung",
    raised_at: "2026-01-14T07:21:00",
    active: true,
    acknowledged: false,
    ...over,
  };
}

const ALERTS: Alert[] = [
  alert(),
  alert({
    id: "rauch:kueche",
    kind: "rauch",
    room_id: "kueche",
    message: XSS,
    severity: "kritisch",
    raised_at: "2026-01-14T07:38:00",
  }),
  alert({
    id: "verbrauch_hoch:haus",
    kind: "verbrauch_hoch",
    room_id: null,
    message: "Backofen und Geschirrspüler gleichzeitig",
    raised_at: "2026-01-14T06:47:00",
    active: false,
    acknowledged: true,
  }),
];

const THRESHOLDS: Thresholds = { room_min_c: 18, room_max_c: 26, co2_max_ppm: 1200, power_max_w: 6000 };

function makeState(over: Partial<SimState> = {}): SimState {
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
    outdoor: { temperature_c: 2, weather: "bewoelkt", sun_elevation_deg: 10, daylight: 0.4, sun_up: true },
    solar: { production_w: 300, consumption_w: 2400, balance_w: -2100 },
    rooms: ROOMS,
    devices: [],
    residents: [],
    alerts: ALERTS,
    thresholds: THRESHOLDS,
    automations: [],
    activity: [],
    active_events: [],
    base_load_w: 150,
    extra_load_w: 0,
    ...over,
  };
}

function renderPage(state: SimState | null) {
  return render(
    <SimStateContext.Provider value={{ state, connected: state !== null }}>
      <MemoryRouter>
        <AlertsPage />
      </MemoryRouter>
    </SimStateContext.Provider>,
  );
}

beforeEach(() => {
  vi.mocked(acknowledgeAlert).mockReset();
  vi.mocked(putThresholds).mockReset();
});

describe("AlertsPage", () => {
  it("shows a loading state while no state has arrived", () => {
    const { container } = renderPage(null);
    expect(container.querySelector('[data-od-id="alerts-head"]')).not.toBeNull();
    expect(screen.getByText("Verbinde mit der Simulation …")).toBeInTheDocument();
  });

  it("lists open alerts critical first and acknowledged ones separately", () => {
    const { container } = renderPage(makeState());
    for (const id of ["alerts-head", "alerts-active", "alerts-acknowledged", "thresholds"]) {
      expect(container.querySelector(`[data-od-id="${id}"]`)).not.toBeNull();
    }
    const active = container.querySelector('[data-od-id="alerts-active"]') as HTMLElement;
    const titles = within(active)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["Rauch erkannt – Küche", "CO2 zu hoch – Kinderzimmer"]);
    expect(within(active).getByText(/seit Mi 07:21/)).toBeInTheDocument();

    const acked = container.querySelector('[data-od-id="alerts-acknowledged"]') as HTMLElement;
    const row = within(acked).getByText("Verbrauch zu hoch – Haus").closest("article") as HTMLElement;
    expect(row).toHaveClass("is-ack");
    expect(within(acked).queryByRole("button", { name: "Bestätigen" })).toBeNull();
  });

  it("shows the empty state when nothing is open", () => {
    renderPage(makeState({ alerts: [] }));
    expect(screen.getByText("Alles ruhig im Haus")).toBeInTheDocument();
  });

  it("acknowledge calls acknowledgeAlert with the alert id", async () => {
    vi.mocked(acknowledgeAlert).mockResolvedValue({ ...ALERTS[0], acknowledged: true });
    renderPage(makeState());
    const row = screen.getByText("CO2 zu hoch – Kinderzimmer").closest("article") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Bestätigen" }));
    await waitFor(() => expect(acknowledgeAlert).toHaveBeenCalledWith("co2_hoch:kinderzimmer"));
  });

  it("shows a failed acknowledgement as a German message", async () => {
    vi.mocked(acknowledgeAlert).mockRejectedValue(new ApiError(404, "Alert not found"));
    renderPage(makeState());
    const row = screen.getByText("CO2 zu hoch – Kinderzimmer").closest("article") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Bestätigen" }));
    expect(await screen.findByText(/Diesen Alarm gibt es nicht mehr/)).toBeInTheDocument();
  });

  it("renders a message with markup literally", () => {
    const { container } = renderPage(makeState());
    expect(screen.getByText((text) => text.includes(XSS))).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("starts neutral and saves a changed threshold", async () => {
    vi.mocked(putThresholds).mockImplementation(async (t) => t);
    renderPage(makeState());
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "CO2-Grenze erhöhen" }));
    await waitFor(() => expect(putThresholds).toHaveBeenCalledWith({ ...THRESHOLDS, co2_max_ppm: 1250 }));
    expect(await screen.findByText(/Gespeichert/)).toBeInTheDocument();
  });

  it("an invalid min/max pair shows feedback and does not save", () => {
    renderPage(makeState({ thresholds: { ...THRESHOLDS, room_min_c: 24, room_max_c: 25 } }));
    fireEvent.click(screen.getByRole("button", { name: "Minimum erhöhen" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Minimum muss unter dem Maximum liegen/);
    expect(putThresholds).not.toHaveBeenCalled();
  });

  it("shows a failed save as an error", async () => {
    vi.mocked(putThresholds).mockRejectedValue(new ApiError(0, "Keine Verbindung zur Simulation"));
    renderPage(makeState());
    fireEvent.click(screen.getByRole("button", { name: "Leistungsgrenze senken" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/nicht gespeichert/);
    expect(screen.getByRole("button", { name: /Erneut speichern/ })).toBeInTheDocument();
  });
});
