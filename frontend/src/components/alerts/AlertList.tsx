import { useRef, useState } from "react";
import { acknowledgeAlert, ApiError } from "../../api/client";
import { ALERT_KIND_LABELS, ALERT_SEVERITY_LABELS, ROOM_LABELS } from "../../labels";
import type { Alert, AlertSeverity, Room, RoomId } from "../../types";
import { AlertList as KitAlertList, AlertRow, EmptyState, formatSimTime, simTimeToMs } from "../../ui";

// Every text below is rendered as a React text node, never as HTML (AC-20).

const SEVERITY_ORDER: Record<AlertSeverity, number> = { kritisch: 0, warnung: 1 };
/** The acknowledged list shows the last 24 simulated hours (design/mockups/alarme.html:107). */
const ACK_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The room's name from the live state ("Haus" for a house-wide alert). */
export function alertPlace(rooms: Room[], roomId: RoomId | null): string {
  if (roomId === null) return "Haus";
  return rooms.find((r) => r.id === roomId)?.name ?? ROOM_LABELS[roomId] ?? roomId;
}

/** "Fenster offen bei Heizung – Küche": the kind label with the place. */
export function alertTitle(alert: Alert, rooms: Room[]): string {
  return `${ALERT_KIND_LABELS[alert.kind] ?? alert.kind} – ${alertPlace(rooms, alert.room_id)}`;
}

/** Open alerts: active and not yet acknowledged, "kritisch" first, then newest first. */
export function openAlerts(alerts: Alert[]): Alert[] {
  return alerts
    .filter((a) => a.active && !a.acknowledged)
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
        simTimeToMs(b.raised_at) - simTimeToMs(a.raised_at),
    );
}

/** Acknowledged alerts raised within the last 24 simulated hours, newest first. */
export function acknowledgedAlerts(alerts: Alert[], now: string): Alert[] {
  const nowMs = simTimeToMs(now);
  return alerts
    .filter((a) => {
      if (!a.acknowledged) return false;
      const t = simTimeToMs(a.raised_at);
      return !Number.isFinite(nowMs) || !Number.isFinite(t) || nowMs - t <= ACK_WINDOW_MS;
    })
    .sort((a, b) => simTimeToMs(b.raised_at) - simTimeToMs(a.raised_at));
}

/** German message for a failed acknowledgement. */
export function acknowledgeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Keine Verbindung zur Simulation. Bitte später erneut versuchen.";
    if (err.status === 404) return "Diesen Alarm gibt es nicht mehr – die Simulation wurde inzwischen zurückgesetzt.";
    return `Der Alarm konnte nicht bestätigt werden (Fehler ${err.status}).`;
  }
  return "Der Alarm konnte nicht bestätigt werden.";
}

export interface AlertListProps {
  alerts: Alert[];
  rooms: Room[];
  /** Current simulation time (for the 24-hour window of the acknowledged list). */
  now: string;
}

/** The design's `alerts-active` and `alerts-acknowledged` (design/mockups/alarme.html:50-159). */
export function AlertList({ alerts, rooms, now }: AlertListProps) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  // Alerts present at first render are not "new"; anything raised later pulses once.
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(alerts.map((a) => a.id));

  const open = openAlerts(alerts);
  const acked = acknowledgedAlerts(alerts, now);

  const acknowledge = async (alert: Alert) => {
    setPending((p) => new Set(p).add(alert.id));
    setMessage(null);
    try {
      // The server broadcasts the new state; every client moves the row to "Bestätigt".
      await acknowledgeAlert(alert.id);
    } catch (err) {
      setMessage(acknowledgeErrorMessage(err));
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(alert.id);
        return next;
      });
    }
  };

  const meta = (alert: Alert, prefix: string) => {
    const severity = alert.severity === "kritisch" ? `${ALERT_SEVERITY_LABELS.kritisch} · ` : "";
    return `${severity}${prefix}${formatSimTime(alert.raised_at)} · ${alert.message}`;
  };

  return (
    <>
      <section className="stack-sm" data-od-id="alerts-active" aria-labelledby="active-title" style={{ gap: "var(--s-3)" }}>
        <div className="row row--between">
          <h2 id="active-title" style={{ fontSize: "var(--fs-lead)" }}>
            Aktive Alarme
          </h2>
          <span className="label">
            <span data-active-count>{open.length}</span> offen
          </span>
        </div>
        {message && (
          <p className="field-error" role="alert">
            {message}
          </p>
        )}
        {open.length === 0 ? (
          <EmptyState
            title="Alles ruhig im Haus"
            text="Kein Raum meldet gerade eine Abweichung. Neue Alarme erscheinen hier, sobald ein Grenzwert überschritten wird."
          />
        ) : (
          <KitAlertList aria-label="Aktive Alarme">
            {open.map((alert, i) => (
              <AlertRow
                key={alert.id}
                as="article"
                titleAs="h3"
                large
                kind={alert.kind}
                title={alertTitle(alert, rooms)}
                meta={meta(alert, "seit ")}
                isNew={!seen.current?.has(alert.id)}
                ackPrimary={i === 0}
                ackPending={pending.has(alert.id)}
                onAcknowledge={() => void acknowledge(alert)}
              />
            ))}
          </KitAlertList>
        )}
      </section>

      <section className="stack-sm" data-od-id="alerts-acknowledged" aria-labelledby="ack-title" style={{ gap: "var(--s-3)" }}>
        <div className="row row--between">
          <h2 id="ack-title" style={{ fontSize: "var(--fs-lead)" }}>
            Bestätigt
          </h2>
          <span className="label">Letzte 24 Stunden</span>
        </div>
        {acked.length === 0 ? (
          <EmptyState
            title="Noch nichts bestätigt"
            text="Bestätigte Alarme der letzten 24 Stunden erscheinen hier – auf allen verbundenen Geräten."
          />
        ) : (
          <KitAlertList aria-label="Bestätigte Alarme">
            {acked.map((alert) => (
              <AlertRow
                key={alert.id}
                as="article"
                titleAs="h3"
                kind={alert.kind}
                acknowledged
                title={alertTitle(alert, rooms)}
                meta={meta(alert, "")}
                ackNote={alert.active ? "Bestätigt · besteht noch" : "Bestätigt"}
              />
            ))}
          </KitAlertList>
        )}
      </section>
    </>
  );
}

export default AlertList;
