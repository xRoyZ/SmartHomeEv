import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SimState } from "../../types";
import { ClockChip, formatSimHm } from "../../ui/ClockChip";
import { cx } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { MainNav } from "./MainNav";

export interface AppHeaderProps {
  state: SimState | null;
  connected: boolean;
}

/** The design's phone breakpoint (design/mockups/styles.css `@media (max-width: 720px)`). */
const PHONE_QUERY = "(max-width: 720px)";

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** Whether a media query matches, following changes (false where matchMedia is missing). */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatch(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

/** Alerts that still need attention: active and not yet acknowledged. */
export function openAlertCount(state: SimState | null): number {
  if (state === null) return 0;
  return state.alerts.filter((a) => a.active && !a.acknowledged).length;
}

/** `.badge-alarm`: count of open alerts, links to /warnungen, pulses once when the count rises. */
function AlertBadge({ count, known }: { count: number; known: boolean }) {
  const [prev, setPrev] = useState(count);
  const [pulse, setPulse] = useState(0);
  if (count !== prev) {
    setPrev(count);
    if (count > prev) setPulse(pulse + 1);
  }
  const label = !known ? "Alarme" : count === 0 ? "Alarme: keine offen" : `Alarme: ${count} offen`;
  return (
    <Link
      key={pulse}
      className="badge-alarm"
      to="/warnungen"
      data-zero={count === 0 ? "true" : "false"}
      aria-label={label}
      data-testid="alert-badge"
    >
      <Icon name="bell-ring" />
      Alarme{" "}
      <span className="num" data-alert-count>
        {known ? count : "–"}
      </span>
    </Link>
  );
}

/** Live/offline marker of the WebSocket connection. */
function ConnectionState({ connected, compact }: { connected: boolean; compact: boolean }) {
  const text = connected ? "Live" : "Getrennt";
  return (
    <span
      className={cx("tag", !connected && "tag--alarm")}
      role="status"
      data-testid="connection-state"
      data-connected={connected ? "true" : "false"}
      title={connected ? "Mit der Simulation verbunden" : "Keine Verbindung zur Simulation"}
    >
      <Icon name={connected ? "wifi" : "wifi-off"} />
      <span className={compact && connected ? "sr-only" : undefined}>{text}</span>
    </span>
  );
}

/**
 * The `site-header` region shared by all screens (design/mockups/alarme.html:13):
 * brand, the "Simulation" marker, the main navigation, the connection state,
 * the clock chip in simulation time and the alert badge.
 */
export function AppHeader({ state, connected }: AppHeaderProps) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const clock = state?.clock ?? null;
  return (
    <header className="site-header" data-testid="site-header">
      <div className="site-header__inner page-pad">
        <Link className="brand" to="/">
          Haus Simulator
        </Link>
        <span className="tag-sim" title="Alle Werte sind simuliert">
          Simulation
        </span>
        <MainNav />
        <div className="header-end">
          <ConnectionState connected={connected} compact={isPhone} />
          <ClockChip clock={clock} />
          {isPhone && (
            // The design hides .clock-chip below 720px; the phone keeps the
            // simulation time as a compact readout so it stays visible on every page.
            <span
              className="mono small num"
              style={{ color: "var(--ink-2)" }}
              data-testid="clock-compact"
            >
              <span className="sr-only">Simulationszeit </span>
              <span key={formatSimHm(clock?.sim_time)} className="tick">
                {formatSimHm(clock?.sim_time)}
              </span>
              {clock?.paused && <span> · Pausiert</span>}
            </span>
          )}
          <AlertBadge count={openAlertCount(state)} known={state !== null} />
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
