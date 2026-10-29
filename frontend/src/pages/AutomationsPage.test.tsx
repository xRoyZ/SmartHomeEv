import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createAutomation, deleteAutomation, setAutomationEnabled, updateAutomation } from "../api/client";
import { SimStateContext } from "../state/SimStateProvider";
import type { Automation, Device, Room, SimState } from "../types";
import { AutomationsPage } from "./AutomationsPage";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    createAutomation: vi.fn(),
    updateAutomation: vi.fn(),
    setAutomationEnabled: vi.fn(),
    deleteAutomation: vi.fn(),
  };
});

function room(id: Room["id"], name: string): Room {
  return {
    id,
    name,
    temperature_c: 20,
    humidity_pct: 45,
    co2_ppm: 600,
    light_lux: 200,
    motion: false,
    last_motion_at: null,
    activity: "none",
    smoke: null,
    leak: null,
    door_open: null,
  };
}

const ROOMS: Room[] = [room("kueche", "Küche"), room("flur", "Flur"), room("schlafzimmer", "Schlafzimmer")];

const DEVICES: Device[] = [
  { id: "kueche.heizung", room_id: "kueche", name: "Heizung", kind: "thermostat", power_w: 0, target_c: 20, heating: false, failed: false },
  { id: "flur.licht", room_id: "flur", name: "Licht", kind: "light", power_w: 0, on: true, brightness: 80 },
  { id: "schlafzimmer.fenster", room_id: "schlafzimmer", name: "Fenster", kind: "window", power_w: 0, open: false },
];

const XSS_NAME = "<img src=x onerror=alert(1)>";

function automation(over: Partial<Automation> = {}): Automation {
  return {
    id: 1,
    name: "Licht aus, wenn 10 Minuten keine Bewegung",
    enabled: true,
    condition: { type: "motion", room_id: "flur", detected: false, minutes: 10 },
    action: { device_id: "flur.licht", set: { on: false } },
    last_fired_at: null,
    ...over,
  };
}

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
    solar: { production_w: 300, consumption_w: 800, balance_w: -500 },
    rooms: ROOMS,
    devices: DEVICES,
    residents: [],
    alerts: [],
    thresholds: { room_min_c: 18, room_max_c: 26, co2_max_ppm: 1200, power_max_w: 6000 },
    automations: [automation()],
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
        <AutomationsPage />
      </MemoryRouter>
    </SimStateContext.Provider>,
  );
}

beforeEach(() => {
  vi.mocked(createAutomation).mockReset();
  vi.mocked(updateAutomation).mockReset();
  vi.mocked(setAutomationEnabled).mockReset();
  vi.mocked(deleteAutomation).mockReset();
});

describe("AutomationsPage", () => {
  it("renders the screen's regions and a German summary per rule", () => {
    const { container } = renderPage(makeState());
    for (const id of ["automations-head", "rules-list", "rule-editor", "activity-log"]) {
      expect(container.querySelector(`[data-od-id="${id}"]`)).not.toBeNull();
    }
    const rule = container.querySelector("article.rule") as HTMLElement;
    expect(within(rule).getByText(/10 Minuten keine Bewegung im Raum Flur/)).toBeInTheDocument();
    expect(within(rule).getByText(/Licht Flur aus/)).toBeInTheDocument();
  });

  it("shows the value with its unit as text, which follows the chosen sensor", () => {
    renderPage(makeState());
    const value = screen.getByLabelText("Wert");
    const unit = value.parentElement?.querySelector("#f-unit") as HTMLElement;
    expect(value.parentElement).toHaveClass("input-unit");
    expect(value).toHaveAttribute("aria-describedby", "f-unit");
    expect(unit.tagName).toBe("SPAN");
    expect(unit).toHaveTextContent("°C");
    fireEvent.change(screen.getByLabelText("Sensor"), { target: { value: "kueche:co2_ppm" } });
    expect(unit).toHaveTextContent("ppm");
  });

  it("gives every rule row its edit, delete and switch controls", () => {
    const { container } = renderPage(makeState());
    const rows = container.querySelectorAll("article.rule");
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((row) => {
      const tools = row.querySelector(".rule__tools") as HTMLElement;
      expect(tools.querySelector("[data-rule-edit]")).not.toBeNull();
      expect(tools.querySelector("[data-rule-del]")).not.toBeNull();
      expect(within(tools).getByRole("switch")).toBeInTheDocument();
    });
  });

  it("creating sends a valid AutomationIn", async () => {
    vi.mocked(createAutomation).mockImplementation(async (a) => ({ ...a, id: 7, last_fired_at: null }));
    renderPage(makeState());

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Küche vorheizen" } });
    fireEvent.change(screen.getByLabelText("Sensor"), { target: { value: "kueche:temperature_c" } });
    fireEvent.change(screen.getByLabelText("Wert"), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText("Gerät"), { target: { value: "kueche.heizung" } });
    fireEvent.change(screen.getByLabelText("Zieltemperatur"), { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));

    await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createAutomation).mock.calls[0][0]).toEqual({
      name: "Küche vorheizen",
      enabled: true,
      condition: { type: "sensor", room_id: "kueche", metric: "temperature_c", op: "<", value: 18 },
      action: { device_id: "kueche.heizung", set: { target_c: 21 } },
    });
    expect(await screen.findByText(/angelegt/)).toBeInTheDocument();
  });

  it("builds a motion condition with minutes and a light action from choices", async () => {
    vi.mocked(createAutomation).mockImplementation(async (a) => ({ ...a, id: 8, last_fired_at: null }));
    renderPage(makeState());

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Flur dunkel" } });
    fireEvent.change(screen.getByLabelText("Bedingung"), { target: { value: "motion" } });
    fireEvent.change(screen.getByLabelText("Raum"), { target: { value: "flur" } });
    fireEvent.change(screen.getByLabelText("Minuten"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Gerät"), { target: { value: "flur.licht" } });
    fireEvent.change(screen.getByLabelText("Aktion"), { target: { value: "off" } });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));

    await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createAutomation).mock.calls[0][0]).toEqual({
      name: "Flur dunkel",
      enabled: true,
      condition: { type: "motion", room_id: "flur", detected: false, minutes: 15 },
      action: { device_id: "flur.licht", set: { on: false } },
    });
  });

  it("shows no error on the untouched form, and German field errors after a save attempt", () => {
    renderPage(makeState());
    expect(screen.queryByText("Bitte einen Namen eingeben.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));
    expect(screen.getByText("Bitte einen Namen eingeben.")).toBeInTheDocument();
    expect(createAutomation).not.toHaveBeenCalled();
  });

  it("shows 409 as a German message", async () => {
    vi.mocked(createAutomation).mockRejectedValue(new ApiError(409, "At most 100 automations can be stored"));
    renderPage(makeState());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Noch eine" } });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));
    expect(await screen.findByText(/bereits 100 Automationen/)).toBeInTheDocument();
  });

  it("editing sends the changed rule via updateAutomation", async () => {
    vi.mocked(updateAutomation).mockImplementation(async (id, a) => ({ ...a, id, last_fired_at: null }));
    renderPage(makeState());
    fireEvent.click(screen.getByRole("button", { name: "Licht aus, wenn 10 Minuten keine Bewegung bearbeiten" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Licht aus, wenn 10 Minuten keine Bewegung");
    fireEvent.change(screen.getByLabelText("Minuten"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));
    await waitFor(() => expect(updateAutomation).toHaveBeenCalledTimes(1));
    const [id, body] = vi.mocked(updateAutomation).mock.calls[0];
    expect(id).toBe(1);
    expect(body.condition).toEqual({ type: "motion", room_id: "flur", detected: false, minutes: 20 });
    expect(body.action).toEqual({ device_id: "flur.licht", set: { on: false } });
  });

  it("toggling calls setAutomationEnabled", async () => {
    vi.mocked(setAutomationEnabled).mockImplementation(async (id, enabled) => automation({ id, enabled }));
    renderPage(makeState());
    fireEvent.click(screen.getByRole("switch", { name: "Licht aus, wenn 10 Minuten keine Bewegung aktiv" }));
    await waitFor(() => expect(setAutomationEnabled).toHaveBeenCalledWith(1, false));
  });

  it("deletes only after confirmation", async () => {
    vi.mocked(deleteAutomation).mockResolvedValue(undefined);
    renderPage(makeState());
    fireEvent.click(screen.getByRole("button", { name: "Licht aus, wenn 10 Minuten keine Bewegung löschen" }));
    expect(deleteAutomation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Löschen$/ }));
    await waitFor(() => expect(deleteAutomation).toHaveBeenCalledWith(1));
  });

  it("renders a name like <img src=x onerror=alert(1)> literally", () => {
    const state = makeState({
      automations: [automation({ name: XSS_NAME })],
      activity: [{ sim_time: "2026-01-14T07:40:00", message: `Automation „${XSS_NAME}“ angelegt`, source: "benutzer" }],
    });
    const { container } = renderPage(state);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { name: XSS_NAME })).toBeInTheDocument();
    expect(screen.getByText(`Automation „${XSS_NAME}“ angelegt`)).toBeInTheDocument();
  });

  it("lists the activity log in simulation time with its source", () => {
    const state = makeState({
      activity: [
        { sim_time: "2026-01-14T07:40:00", message: "Automation „Licht aus“: Licht Flur: aus", source: "automation" },
        { sim_time: "2026-01-13T22:36:00", message: "Licht Küche aus", source: "benutzer" },
      ],
    });
    const { container } = renderPage(state);
    const log = container.querySelector('[data-od-id="activity-log"]') as HTMLElement;
    expect(within(log).getByText("07:40")).toBeInTheDocument();
    expect(within(log).getByText("Automation")).toBeInTheDocument();
    expect(within(log).getByText("Heute, Mittwoch")).toBeInTheDocument();
    expect(within(log).getByText("Gestern, Dienstag")).toBeInTheDocument();
  });

  it("renders a waiting state before the first simulation state", () => {
    renderPage(null);
    expect(screen.getAllByText(/Verbinde mit der Simulation/).length).toBeGreaterThan(0);
  });
});
