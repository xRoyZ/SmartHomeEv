import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, resetSimulation, triggerEvent, updateSettings } from "../api/client";
import { SimStateContext } from "../state/SimStateProvider";
import type { SimState } from "../types";
import { SettingsPage } from "./SettingsPage";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    updateSettings: vi.fn(),
    triggerEvent: vi.fn(),
    resetSimulation: vi.fn(),
  };
});

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
    ...over,
  };
}

function renderPage(state: SimState | null) {
  return render(
    <SimStateContext.Provider value={{ state, connected: state !== null }}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </SimStateContext.Provider>,
  );
}

beforeEach(() => {
  vi.mocked(updateSettings).mockReset();
  vi.mocked(triggerEvent).mockReset();
  vi.mocked(resetSimulation).mockReset();
});

describe("SettingsPage", () => {
  it("shows a loading state while the state is not there yet", () => {
    renderPage(null);
    expect(screen.getByText("Simulation wird geladen …")).toBeInTheDocument();
  });

  it("renders the screen's regions", () => {
    const { container } = renderPage(makeState());
    for (const id of ["simulation-head", "conditions", "events", "reset-zone"]) {
      expect(container.querySelector(`[data-od-id="${id}"]`)).not.toBeNull();
    }
  });

  it("choosing Sommer calls updateSettings({season:'sommer'})", async () => {
    vi.mocked(updateSettings).mockImplementation(async (u) => ({ ...makeState().settings, ...u }));
    renderPage(makeState());
    fireEvent.click(screen.getByRole("button", { name: "Sommer" }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ season: "sommer" }));
    expect(await screen.findByText("Jahreszeit Sommer übernommen.")).toBeInTheDocument();
  });

  it("an event trigger calls triggerEvent with its type", async () => {
    vi.mocked(triggerEvent).mockResolvedValue({
      type: "wasserschaden",
      room_id: "bad",
      started_at: "2026-01-14T07:42:00",
      ends_at: null,
    });
    renderPage(makeState());
    fireEvent.click(screen.getByRole("button", { name: /Wasserschaden/ }));
    await waitFor(() => expect(triggerEvent).toHaveBeenCalledWith("wasserschaden"));
    expect(await screen.findByText(/Wasserschaden \(Bad\) ausgelöst/)).toBeInTheDocument();
  });

  it("shows a failed trigger in German", async () => {
    vi.mocked(triggerEvent).mockRejectedValue(new ApiError(0, "Keine Verbindung zur Simulation"));
    renderPage(makeState());
    fireEvent.click(screen.getByRole("button", { name: /Stromspitze/ }));
    expect(await screen.findByText(/Stromspitze nicht ausgelöst: Keine Verbindung/)).toBeInTheDocument();
  });

  it("resets only after the confirmation", async () => {
    vi.mocked(resetSimulation).mockResolvedValue(makeState());
    renderPage(makeState());
    fireEvent.click(screen.getByRole("button", { name: /Auf Ausgangszustand zurücksetzen/ }));
    expect(resetSimulation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Ja, zurücksetzen/ }));
    await waitFor(() => expect(resetSimulation).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/zurückgesetzt – Startzeit 06:00, Seed 42/)).toBeInTheDocument();
  });

  it("cancelling the confirmation does not reset", () => {
    renderPage(makeState());
    fireEvent.click(screen.getByRole("button", { name: /Auf Ausgangszustand zurücksetzen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(resetSimulation).not.toHaveBeenCalled();
  });

  it("validates the saved fields only after a change, then saves them", async () => {
    vi.mocked(updateSettings).mockImplementation(async (u) => ({ ...makeState().settings, ...u }));
    renderPage(makeState());
    expect(screen.queryByText(/ganze Zahl/)).toBeNull();

    const seed = screen.getByLabelText("Seed");
    fireEvent.change(seed, { target: { value: "-3" } });
    expect(screen.getByText(/Bitte eine ganze Zahl/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Einstellungen übernehmen/ }));
    expect(updateSettings).not.toHaveBeenCalled();

    fireEvent.change(seed, { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Startzeit"), { target: { value: "08:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Erwachsene erhöhen" }));
    fireEvent.click(screen.getByRole("button", { name: /Einstellungen übernehmen/ }));
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith({
        start_time: "2026-01-14T08:30:00",
        seed: 7,
        adults: 3,
        children: 1,
      }),
    );
  });

  it("shows the start time as a German 24-hour time", () => {
    renderPage(makeState({ settings: { ...makeState().settings, start_time: "2026-01-14T18:45:00" } }));
    const field = screen.getByLabelText("Startzeit") as HTMLInputElement;
    expect(field.value).toBe("18:45");
    expect(field.value).not.toMatch(/AM|PM|\//);
  });

  it("changing the time sends an ISO start_time with the new time on the settings' date", async () => {
    vi.mocked(updateSettings).mockImplementation(async (u) => ({ ...makeState().settings, ...u }));
    renderPage(makeState());
    fireEvent.change(screen.getByLabelText("Startzeit"), { target: { value: "21:15" } });
    fireEvent.click(screen.getByRole("button", { name: /Einstellungen übernehmen/ }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(updateSettings).mock.calls[0][0];
    expect(sent.start_time).toBe("2026-01-14T21:15:00");
    expect(sent.start_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it("rejects an impossible time only after it was typed", () => {
    renderPage(makeState());
    expect(screen.queryByText(/Uhrzeit von 00:00 bis 23:59/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Startzeit"), { target: { value: "25:00" } });
    expect(screen.getByText(/Uhrzeit von 00:00 bis 23:59/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Einstellungen übernehmen/ }));
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
