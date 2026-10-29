import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../App";
import { AppHeader } from "../components/chrome/AppHeader";
import { Gallery, SAMPLE_UNSAFE_NAME, sampleState } from "../dev/Gallery";
import { SimStateContext } from "../state/SimStateProvider";
import type { SimState } from "../types";
import { AlertRow, Chips, formatSimTime, niceTicks, Stepper, stepValue, Switch, TimeChart } from "./index";

function renderGallery() {
  return render(
    <MemoryRouter initialEntries={["/dev/galerie"]}>
      <Gallery />
    </MemoryRouter>,
  );
}

function renderHeader(state: SimState | null, connected = true, path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppHeader state={state} connected={connected} />
    </MemoryRouter>,
  );
}

describe("gallery", () => {
  it("renders every component group", () => {
    renderGallery();
    for (const title of ["Kopfzeile", "Schaltflächen", "Seitenkopf, Fläche und Raster", "Live-Werte und Uhr", "Alarme", "Eingaben", "Verläufe"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    // a chart per state: temperature, CO2 with limit, power, mini, empty
    expect(document.querySelectorAll(".chart")).toHaveLength(4);
    expect(document.querySelector(".chart--mini")).not.toBeNull();
    expect(screen.getByText("Noch keine Messwerte")).toBeInTheDocument();
    expect(screen.getAllByText("Grenze").length).toBeGreaterThan(0);
    // alert rows: new, acknowledged, large
    expect(document.querySelector(".alert-row.is-new")).not.toBeNull();
    expect(document.querySelector(".alert-row.is-ack")).not.toBeNull();
    expect(document.querySelector(".alert-row--lg")).not.toBeNull();
    // disabled with a visible reason
    expect(screen.getByText("Erst einen Namen eintragen")).toBeInTheDocument();
    expect(screen.getByText("Maximum erreicht")).toBeInTheDocument();
  });

  it("shows a user-entered name literally and never as markup", () => {
    const { container } = renderGallery();
    expect(screen.getAllByText(SAMPLE_UNSAFE_NAME).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByDisplayValue(SAMPLE_UNSAFE_NAME)).toBeInTheDocument();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("its controls react: toggle, acknowledge, stepper", () => {
    renderGallery();
    const pause = screen.getAllByRole("button", { name: /Pause/ })[0];
    expect(pause).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pause);
    expect(pause).toHaveAttribute("aria-pressed", "true");

    const firstRow = document.querySelector(".alert-row.is-new") as HTMLElement;
    fireEvent.click(within(firstRow).getByRole("button", { name: "Bestätigen" }));
    expect(firstRow).toHaveClass("is-ack");

    const stepper = screen.getByRole("group", { name: "Zieltemperatur" });
    fireEvent.click(within(stepper).getByRole("button", { name: "Zieltemperatur erhöhen" }));
    expect(stepper).toHaveTextContent("22,0");
  });
});

describe("header", () => {
  it("shows brand, simulated marker, clock, alert badge and connection", () => {
    renderHeader(sampleState());
    const header = screen.getByTestId("site-header");
    expect(within(header).getByRole("link", { name: "Haus Simulator" })).toHaveAttribute("href", "/");
    expect(header.querySelector(".tag-sim")).toHaveTextContent("Simulation");
    expect(header.querySelector(".clock-chip")).toHaveTextContent("Mi 07:42 · 60x");
    const badge = screen.getByTestId("alert-badge");
    expect(badge).toHaveAttribute("href", "/alarme");
    expect(badge).toHaveAttribute("data-zero", "false");
    expect(badge).toHaveTextContent("Alarme 2");
    expect(screen.getByTestId("connection-state")).toHaveTextContent("Live");
  });

  it("moves its clock with the state and marks a paused clock", () => {
    const { rerender } = renderHeader(sampleState());
    const next = sampleState({ clock: { sim_time: "2026-01-14T07:43:00", speed: 360, paused: true } });
    rerender(
      <MemoryRouter>
        <AppHeader state={next} connected={false} />
      </MemoryRouter>,
    );
    expect(document.querySelector(".clock-chip")).toHaveTextContent("Mi 07:43 · Pausiert");
    expect(screen.getByTestId("connection-state")).toHaveTextContent("Getrennt");
  });

  it("badge counts only open alerts and reads zero without any", () => {
    renderHeader(sampleState({ alerts: [] }));
    expect(screen.getByTestId("alert-badge")).toHaveAttribute("data-zero", "true");
    expect(screen.getByTestId("alert-badge")).toHaveTextContent("Alarme 0");
  });

  it("renders without a state yet", () => {
    renderHeader(null, false);
    expect(document.querySelector(".clock-chip")).toHaveTextContent("--:--");
    expect(screen.getByTestId("alert-badge")).toHaveTextContent("Alarme –");
  });

  it("navigation links reach every page and mark the current one", () => {
    renderHeader(sampleState(), true, "/raum/kueche");
    const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/", "/verlauf", "/automationen", "/alarme", "/simulation"]);
    expect(within(nav).getByRole("link", { name: "Übersicht" })).toHaveAttribute("aria-current", "page");
  });

  it("navigates between the pages inside the app frame", () => {
    render(
      <SimStateContext.Provider value={{ state: sampleState(), connected: true }}>
        <MemoryRouter initialEntries={["/"]}>
          <AppRoutes />
        </MemoryRouter>
      </SimStateContext.Provider>,
    );
    const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
    const pages: [string, string][] = [
      ["Verlauf", "history"],
      ["Automationen", "automations"],
      ["Alarme", "alerts"],
      ["Simulation", "settings"],
      ["Übersicht", "overview"],
    ];
    for (const [label, page] of pages) {
      act(() => {
        fireEvent.click(within(nav).getByRole("link", { name: label }));
      });
      expect(document.querySelector(`[data-page="${page}"]`)).not.toBeNull();
      expect(within(nav).getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }
    act(() => {
      fireEvent.click(screen.getByTestId("alert-badge"));
    });
    expect(document.querySelector('[data-page="alerts"]')).not.toBeNull();
  });
});

describe("components", () => {
  it("stepper clamps and disables at its bounds", () => {
    expect(stepValue(29.5, 1, 0.5, 5, 30)).toBe(30);
    expect(stepValue(30, 1, 0.5, 5, 30)).toBe(30);
    expect(stepValue(5.1, -1, 0.5, 5, 30)).toBe(5);
    function Harness() {
      const [v, setV] = useState(29);
      return <Stepper label="Ziel" value={v} min={5} max={30} step={1} onChange={setV} />;
    }
    render(<Harness />);
    const inc = screen.getByRole("button", { name: "Ziel erhöhen" });
    fireEvent.click(inc);
    expect(inc).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ziel senken" })).not.toBeDisabled();
  });

  it("switch toggles, and a disabled one does nothing and says why", () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Switch label="Stehlampe" checked={on} onChange={setOn} whenOn="an" whenOff="aus" />;
    }
    render(<Harness />);
    const sw = screen.getByRole("switch", { name: "Stehlampe" });
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");

    let calls = 0;
    render(<Switch label="Defekt" checked={false} onChange={() => (calls += 1)} disabled disabledHint="Gerät ausgefallen" />);
    fireEvent.click(screen.getByRole("switch", { name: "Defekt" }));
    expect(calls).toBe(0);
    expect(screen.getByText("Gerät ausgefallen")).toBeInTheDocument();
  });

  it("switch keeps its accessible name in both states and renders no text inside its track", () => {
    function Harness() {
      const [on, setOn] = useState(true);
      return <Switch label="Heizung aus, wenn Fenster offen aktiv" checked={on} onChange={setOn} />;
    }
    render(<Harness />);
    const sw = screen.getByRole("switch", { name: "Heizung aus, wenn Fenster offen aktiv" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    // No text node inside the button: a label there would be drawn in the track colour.
    expect(sw.textContent).toBe("");
    fireEvent.click(sw);
    const off = screen.getByRole("switch", { name: "Heizung aus, wenn Fenster offen aktiv" });
    expect(off).toHaveAttribute("aria-checked", "false");
    expect(off.textContent).toBe("");
    fireEvent.click(off);
    expect(screen.getByRole("switch", { name: "Heizung aus, wenn Fenster offen aktiv" })).toHaveAttribute("aria-checked", "true");
  });

  it("switch state text follows the state outside the track", () => {
    const { rerender } = render(<Switch label="Stehlampe" checked={false} onChange={() => undefined} whenOn="an" whenOff="aus" />);
    expect(screen.getByText("aus")).toBeInTheDocument();
    expect(screen.queryByText("an")).toBeNull();
    rerender(<Switch label="Stehlampe" checked onChange={() => undefined} whenOn="an" whenOff="aus" />);
    expect(screen.getByText("an")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Stehlampe" }).textContent).toBe("");
  });

  it("disabled chips ignore clicks", () => {
    let calls = 0;
    render(
      <Chips
        label="Raum"
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
        value="a"
        onChange={() => (calls += 1)}
        disabled
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "B" }));
    expect(calls).toBe(0);
    expect(screen.getByRole("button", { name: "B" })).toHaveAttribute("aria-disabled", "true");
  });

  it("acknowledged alert row shows the note instead of the button", () => {
    render(<AlertRow kind="rauch" title="Rauch – Küche" acknowledged ackNote="Bestätigt Mi 07:50" onAcknowledge={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Bestätigen" })).toBeNull();
    expect(screen.getByText("Bestätigt Mi 07:50")).toBeInTheDocument();
  });

  it("time chart labels simulation time on the x axis and the latest values", () => {
    render(
      <TimeChart
        ariaLabel="Test"
        unit="°"
        decimals={1}
        now="2026-01-14T07:42:00"
        series={[
          {
            key: "wohnzimmer",
            label: "Wohnzimmer",
            points: [
              { t: "2026-01-13T07:42:00", v: 20 },
              { t: "2026-01-14T07:42:00", v: 21 },
            ],
          },
        ]}
      />,
    );
    const chart = screen.getByRole("img", { name: "Test" });
    const x = chart.querySelector(".chart__x") as HTMLElement;
    expect(x.firstElementChild).toHaveTextContent("Di 07:42");
    expect(x.lastElementChild).toHaveTextContent("Mi 07:42");
    expect(screen.getByText("Jetzt 07:42")).toBeInTheDocument();
    const legend = document.querySelector(".legend") as HTMLElement;
    expect(within(legend).getByText("21,0°")).toBeInTheDocument();
  });

  it("formats simulation time without a time zone shift and finds nice ticks", () => {
    expect(formatSimTime("2026-01-14T23:59:00")).toBe("Mi 23:59");
    expect(formatSimTime("kaputt")).toBe("--:--");
    const ticks = niceTicks(17.3, 22.8);
    expect(ticks[0]).toBeLessThanOrEqual(17.3);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(22.8);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });
});
