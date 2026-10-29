import { useState } from "react";
import {
  acknowledgeAlert,
  ApiError,
  pauseSimulation,
  resetSimulation,
  resumeSimulation,
  setSpeed,
} from "../api/client";
import { FloorPlan } from "../components/overview/FloorPlan";
import { OutdoorPanel } from "../components/overview/OutdoorPanel";
import { SEASON_LABELS, SPEED_LABELS, SPEEDS } from "../labels";
import { useSimState } from "../state/SimStateProvider";
import type { Alert, Season, SimState, Speed } from "../types";
import {
  AlertList,
  AlertRow,
  Button,
  cx,
  EmptyState,
  formatSimDay,
  formatSimHm,
  Icon,
  type IconName,
  Segmented,
  TextLink,
} from "../ui";

/** How many active alerts and activity entries the overview lists before linking on. */
const MAX_ALERTS = 4;
const MAX_ACTIVITY = 3;

const SEASON_ICONS: Record<Season, IconName> = {
  fruehling: "leaf",
  sommer: "sun",
  herbst: "leaf",
  winter: "thermometer-snowflake",
};

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.detail) return `${fallback}: ${err.detail}`;
  return `${fallback}. Bitte erneut versuchen.`;
}

/** The clock band: simulation time, season, tempo, pause/resume and reset (design/mockups/index.html:36-84). */
function ClockBand({ state }: { state: SimState }) {
  const { clock } = state;
  const [busy, setBusy] = useState<null | "toggle" | "speed" | "reset">(null);
  const [pendingSpeed, setPendingSpeed] = useState<Speed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "toggle" | "speed" | "reset", action: () => Promise<unknown>, failText: string) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err, failText));
    } finally {
      setBusy(null);
      setPendingSpeed(null);
    }
  };

  const onToggle = () =>
    run(
      "toggle",
      () => (clock.paused ? resumeSimulation() : pauseSimulation()),
      clock.paused ? "Fortsetzen fehlgeschlagen" : "Pausieren fehlgeschlagen",
    );
  const onSpeed = (speed: Speed) => {
    setPendingSpeed(speed);
    void run("speed", () => setSpeed(speed), "Tempo konnte nicht geändert werden");
  };
  const onReset = () => run("reset", () => resetSimulation(), "Zurücksetzen fehlgeschlagen");

  const season = state.settings.season;
  return (
    <section
      className={cx("clock-band", clock.paused && "is-paused")}
      data-od-id="clock-band"
      aria-label="Simulationsuhr"
      data-paused={clock.paused ? "true" : "false"}
    >
      <div className="page-pad clock-band__inner">
        <div>
          <p className="label">Simulationszeit</p>
          <p className="clock-time" data-od-id="sim-clock">
            <span className="day">{formatSimDay(clock.sim_time)}</span>
            <span>{formatSimHm(clock.sim_time)}</span>
          </p>
        </div>
        <div className="clock-meta">
          <p className="chip-season" data-season={season}>
            <Icon name={SEASON_ICONS[season] ?? "leaf"} />
            {SEASON_LABELS[season] ?? season}
          </p>
          {clock.paused && <p className="paused-note">Pausiert</p>}
        </div>
        <div data-od-id="speed-segments">
          <Segmented<Speed>
            label="Tempo"
            options={SPEEDS.map((s) => ({ value: s, label: SPEED_LABELS[s] }))}
            value={pendingSpeed ?? clock.speed}
            onChange={onSpeed}
            disabled={busy === "speed" || busy === "reset"}
          />
        </div>
        <div className="clock-actions">
          <Button
            variant="primary"
            icon={clock.paused ? "play" : "pause"}
            pressed={clock.paused}
            whenOff="Pause"
            whenOn="Fortsetzen"
            onClick={onToggle}
            disabled={busy === "toggle" || busy === "reset"}
            data-od-id="play-pause"
          />
          <Button icon="rotate-ccw" onClick={onReset} disabled={busy !== null} data-od-id="clock-reset">
            {busy === "reset" ? "Wird zurückgesetzt …" : "Zurücksetzen"}
          </Button>
        </div>
        {error && (
          <p className="small" role="alert" style={{ flexBasis: "100%", color: "var(--alarm-soft)" }}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

/** Unacknowledged first, then newest first. */
function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
    return a.raised_at < b.raised_at ? 1 : a.raised_at > b.raised_at ? -1 : 0;
  });
}

/** The side block `active-alerts` (design/mockups/index.html:267-319). */
function ActiveAlerts({ alerts }: { alerts: Alert[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = sortAlerts(alerts.filter((a) => a.active));
  const shown = active.slice(0, MAX_ALERTS);

  const onAck = async (alert: Alert) => {
    setPending(alert.id);
    setError(null);
    try {
      await acknowledgeAlert(alert.id);
    } catch (err) {
      setError(errorText(err, "Bestätigen fehlgeschlagen"));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="side-block" data-od-id="active-alerts" aria-label="Aktive Alarme">
      <div className="row row--between">
        <p className="label">Aktive Alarme</p>
        <TextLink to="/alarme">Alle Alarme</TextLink>
      </div>
      {shown.length > 0 ? (
        <AlertList>
          {shown.map((a) => (
            <AlertRow
              key={a.id}
              kind={a.kind}
              title={a.message}
              meta={`seit ${formatSimHm(a.raised_at)}`}
              isNew={!a.acknowledged}
              acknowledged={a.acknowledged}
              onAcknowledge={() => void onAck(a)}
              ackPending={pending === a.id}
            />
          ))}
        </AlertList>
      ) : (
        <EmptyState title="Alles ruhig" text="Im ganzen Haus liegt gerade kein Alarm vor." />
      )}
      {active.length > shown.length && (
        <p className="small muted">
          {active.length - shown.length} weitere unter „Alle Alarme“
        </p>
      )}
      {error && (
        <p className="small" role="alert" style={{ color: "var(--alarm-soft)" }}>
          {error}
        </p>
      )}
    </section>
  );
}

/** The `activity-latest` line with the newest entries of the activity log. */
function ActivityLatest({ state }: { state: SimState }) {
  const latest = state.activity.slice(0, MAX_ACTIVITY);
  return (
    <div className="log-line" data-od-id="activity-latest">
      <Icon name="zap" />
      <div className="log-line__text">
        {latest.length === 0 ? (
          <p>Noch keine Aktivität aufgezeichnet.</p>
        ) : (
          <ul className="stack-sm" style={{ gap: "var(--s-1)", listStyle: "none", padding: 0, margin: 0 }}>
            {latest.map((e, i) => (
              <li key={`${e.sim_time}-${i}`} data-activity-source={e.source}>
                <span className="mono">{formatSimHm(e.sim_time)}</span>
                {"\u00a0\u00a0"}
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <TextLink to="/automationen">Aktivitätsprotokoll</TextLink>
    </div>
  );
}

/** The live house overview (design/mockups/index.html) for "/". */
export function OverviewPage() {
  const { state } = useSimState();

  if (state === null) {
    return (
      <main className="page" data-page="overview">
        <div className="page-pad" style={{ paddingBlock: "var(--s-6)" }}>
          <h1 className="sr-only">Live-Übersicht des Hauses</h1>
          <p className="small muted" role="status">
            Hausdaten werden geladen …
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page" data-page="overview">
      <h1 className="sr-only">Live-Übersicht des Hauses</h1>
      <ClockBand state={state} />
      <div className="page-pad">
        <div className="grid main-split region">
          <FloorPlan state={state} />
          <aside className="span-4" aria-label="Außenwetter, Energie und Alarme">
            <OutdoorPanel outdoor={state.outdoor} solar={state.solar} />
            <ActiveAlerts alerts={state.alerts} />
          </aside>
        </div>
        <ActivityLatest state={state} />
        <div style={{ height: "var(--s-6)" }} />
      </div>
    </main>
  );
}

export default OverviewPage;
