import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../api/client";
import { SimStateContext } from "../state/SimStateProvider";
import type { Device, HistoryResponse, Room, RoomId, SimState } from "../types";
import { RoomPage } from "./RoomPage";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, updateDevice: vi.fn(), getHistory: vi.fn() };
});

const updateDevice = vi.mocked(client.updateDevice);
const getHistory = vi.mocked(client.getHistory);

function room(id: RoomId, name: string, extra: Partial<Room> = {}): Room {
  return {
    id,
    name,
    temperature_c: 21,
    humidity_pct: 48,
    co2_ppm: 820,
    light_lux: 300,
    motion: true,
    last_motion_at: null,
    activity: "none",
    smoke: null,
    leak: null,
    door_open: null,
    ...extra,
  };
}

const devices: Device[] = [
  { id: "wohnzimmer.heizung", room_id: "wohnzimmer", name: "Heizung", kind: "thermostat", power_w: 0, target_c: 21, heating: true, failed: false },
  { id: "wohnzimmer.licht", room_id: "wohnzimmer", name: "Licht", kind: "light", power_w: 40, on: true, brightness: 60 },
  { id: "wohnzimmer.fenster", room_id: "wohnzimmer", name: "Fenster", kind: "window", power_w: 0, open: false },
  { id: "wohnzimmer.rollladen", room_id: "wohnzimmer", name: "Rollladen", kind: "shutter", power_w: 0, position: 60 },
  { id: "wohnzimmer.tv", room_id: "wohnzimmer", name: "Fernseher", kind: "plug", power_w: 0, on: false, rated_w: 120 },
  { id: "bad.heizung", room_id: "bad", name: "Heizung", kind: "thermostat", power_w: 0, target_c: 22, heating: false, failed: false },
  { id: "bad.licht", room_id: "bad", name: "Licht", kind: "light", power_w: 0, on: false, brightness: 0 },
  { id: "bad.fenster", room_id: "bad", name: "Fenster", kind: "window", power_w: 0, open: false },
  {
    id: "bad.waschmaschine",
    room_id: "bad",
    name: "Waschmaschine",
    kind: "appliance",
    power_w: 0,
    on: false,
    program: null,
    programs: ["Eco 40", "Koch 90"],
    rated_w: 2000,
  },
];

function makeState(): SimState {
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
    rooms: [room("wohnzimmer", "Wohnzimmer"), room("bad", "Bad", { leak: false })],
    devices,
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

const history: HistoryResponse = {
  metric: "temperature",
  from_time: "2026-01-13T07:42:00",
  to_time: "2026-01-14T07:42:00",
  series: [
    { key: "wohnzimmer", label: "Wohnzimmer", points: [{ t: "2026-01-14T07:00:00", v: 20.5 }, { t: "2026-01-14T07:40:00", v: 21 }] },
    { key: "aussen", label: "Außen", points: [{ t: "2026-01-14T07:00:00", v: 1.5 }, { t: "2026-01-14T07:40:00", v: 2 }] },
  ],
};

function renderRoom(path: string, state: SimState | null = makeState()) {
  return render(
    <SimStateContext.Provider value={{ state, connected: true }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/raum/:roomId" element={<RoomPage />} />
          <Route path="/" element={<p>Übersicht-Seite</p>} />
        </Routes>
      </MemoryRouter>
    </SimStateContext.Provider>,
  );
}

function region(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-od-id="${id}"]`);
  if (!el) throw new Error(`region ${id} missing`);
  return el;
}

beforeEach(() => {
  updateDevice.mockReset();
  getHistory.mockReset();
  updateDevice.mockImplementation(async (id) => devices.find((d) => d.id === id) as Device);
  getHistory.mockResolvedValue(history);
});

describe("RoomPage", () => {
  it("renders the room head with its live sensors", async () => {
    const { container } = renderRoom("/raum/wohnzimmer");
    expect(screen.getByRole("heading", { level: 1, name: "Wohnzimmer" })).toBeInTheDocument();
    const strip = region(container, "sensor-strip");
    expect(within(strip).getByText("Feuchte")).toBeInTheDocument();
    expect(within(strip).getByText("CO2")).toBeInTheDocument();
    expect(within(strip).getByText("Fenster")).toBeInTheDocument();
    // wohnzimmer has neither a smoke nor a leak sensor
    expect(within(strip).queryByText("Rauch")).toBeNull();
    expect(within(strip).queryByText("Wasser")).toBeNull();
    await waitFor(() => expect(getHistory).toHaveBeenCalled());
  });

  it("raising the heating target sends target_c", async () => {
    const { container } = renderRoom("/raum/wohnzimmer");
    fireEvent.click(within(region(container, "control-heizung")).getByRole("button", { name: "Zieltemperatur erhöhen" }));
    await waitFor(() => expect(updateDevice).toHaveBeenCalledWith("wohnzimmer.heizung", { target_c: 21.5 }));
  });

  it("dimming the light sends the brightness", async () => {
    const { container } = renderRoom("/raum/wohnzimmer");
    fireEvent.change(within(region(container, "control-licht")).getByLabelText("Helligkeit in Prozent"), {
      target: { value: "40" },
    });
    await waitFor(() => expect(updateDevice).toHaveBeenCalledWith("wohnzimmer.licht", { brightness: 40 }));
  });

  it("switching the light off, the window open and the plug on sends their updates", async () => {
    const { container } = renderRoom("/raum/wohnzimmer");
    fireEvent.click(within(region(container, "control-licht")).getByRole("button", { name: /Licht/ }));
    await waitFor(() => expect(updateDevice).toHaveBeenCalledWith("wohnzimmer.licht", { on: false }));
    fireEvent.click(within(region(container, "control-fenster")).getByRole("button", { name: /Fenster/ }));
    await waitFor(() => expect(updateDevice).toHaveBeenCalledWith("wohnzimmer.fenster", { open: true }));
    fireEvent.click(within(region(container, "control-geraete")).getByRole("switch", { name: "Fernseher" }));
    await waitFor(() => expect(updateDevice).toHaveBeenCalledWith("wohnzimmer.tv", { on: true }));
  });

  it("the shutter sends the contract's position (100 = closed)", async () => {
    const { container } = renderRoom("/raum/wohnzimmer");
    fireEvent.change(within(region(container, "control-rollladen")).getByRole("slider"), { target: { value: "100" } });
    await waitFor(() => expect(updateDevice).toHaveBeenCalledWith("wohnzimmer.rollladen", { position: 0 }));
  });

  it("an appliance program is chosen from device.programs", async () => {
    const { container } = renderRoom("/raum/bad");
    const select = within(region(container, "control-geraete")).getByLabelText("Programm Waschmaschine");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Kein Programm", "Eco 40", "Koch 90"]);
    fireEvent.change(select, { target: { value: "Koch 90" } });
    await waitFor(() => expect(updateDevice).toHaveBeenCalledWith("bad.waschmaschine", { program: "Koch 90" }));
  });

  it("a room without shutter shows no shutter control", () => {
    const { container } = renderRoom("/raum/bad");
    expect(container.querySelector('[data-od-id="control-rollladen"]')).toBeNull();
    expect(container.querySelector('[data-od-id="control-fenster"]')).not.toBeNull();
    expect(within(region(container, "sensor-strip")).getByText("Wasser")).toBeInTheDocument();
  });

  it("shows a rejected update as a German error", async () => {
    updateDevice.mockRejectedValueOnce(new client.ApiError(422, "Feld ungültig"));
    const { container } = renderRoom("/raum/wohnzimmer");
    fireEvent.click(within(region(container, "control-fenster")).getByRole("button", { name: /Fenster/ }));
    expect(await within(region(container, "control-fenster")).findByRole("alert")).toHaveTextContent(
      "Wert nicht übernommen: Feld ungültig",
    );
  });

  it("the history chart requests the room's 24 h temperature", async () => {
    const { container } = renderRoom("/raum/wohnzimmer");
    await waitFor(() => expect(getHistory).toHaveBeenCalledWith("temperature", "wohnzimmer", 24));
    const hist = region(container, "room-history");
    expect(await within(hist).findByRole("img")).toBeInTheDocument();
    expect(within(hist).getByText("Außen")).toBeInTheDocument();
  });

  it("an unknown room shows a not-found state with a link back", () => {
    renderRoom("/raum/keller");
    expect(screen.getByRole("heading", { name: "Raum nicht gefunden" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Zur Übersicht/ })).toHaveAttribute("href", "/");
    expect(getHistory).not.toHaveBeenCalled();
  });
});
