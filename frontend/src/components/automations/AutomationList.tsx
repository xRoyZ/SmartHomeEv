import { useState } from "react";
import { ApiError, deleteAutomation, setAutomationEnabled } from "../../api/client";
import { ROOM_LABELS, SENSOR_METRIC_LABELS } from "../../labels";
import type { Action, Automation, Condition, Device, Room, RoomId, SensorMetric } from "../../types";
import { Button, EmptyState, formatNumber, formatSimTime, IconButton, Switch } from "../../ui";

// ------------------------------------------------------------------ German rule summaries
// Every text below is rendered as a React text node, never as HTML (AC-20).

/** The unit of a sensor metric. */
export const METRIC_UNITS: Record<SensorMetric, string> = {
  temperature_c: "°C",
  humidity_pct: "%",
  co2_ppm: "ppm",
};

/** The room's name from the live state, else the fixed German label. */
export function roomName(rooms: Room[], id: RoomId | null | undefined): string {
  if (!id) return "";
  return rooms.find((r) => r.id === id)?.name ?? ROOM_LABELS[id] ?? id;
}

/** "Heizung Küche": a device's name with its room. */
export function deviceLabel(device: Device, rooms: Room[]): string {
  const room = roomName(rooms, device.room_id);
  return room ? `${device.name} ${room}` : device.name;
}

function deviceLabelById(id: string, devices: Device[], rooms: Room[]): string {
  const device = devices.find((d) => d.id === id);
  return device ? deviceLabel(device, rooms) : id;
}

/** The condition as German text, e.g. "Temperatur Küche < 18 °C". */
export function describeCondition(cond: Condition, devices: Device[], rooms: Room[]): string {
  switch (cond.type) {
    case "sensor": {
      const what =
        cond.room_id === null
          ? "Außentemperatur"
          : `${SENSOR_METRIC_LABELS[cond.metric]} ${roomName(rooms, cond.room_id)}`;
      const decimals = Number.isInteger(cond.value) ? 0 : 1;
      return `${what} ${cond.op} ${formatNumber(cond.value, decimals)} ${METRIC_UNITS[cond.metric]}`;
    }
    case "contact":
      return `${deviceLabelById(cond.device_id, devices, rooms)} ${cond.open ? "offen" : "geschlossen"} ist`;
    case "motion": {
      const room = roomName(rooms, cond.room_id);
      return cond.detected
        ? `Bewegung im Raum ${room} in den letzten ${cond.minutes} Minuten`
        : `${cond.minutes} Minuten keine Bewegung im Raum ${room}`;
    }
    case "time":
      return `es ${cond.at} Uhr ist`;
    case "sun":
      return cond.state === "down" ? "die Sonne untergeht" : "die Sonne aufgeht";
  }
}

const isSet = <T,>(v: T | null | undefined): v is T => v !== null && v !== undefined;

/** The action as German text, e.g. "Heizung Küche auf 21 °C". */
export function describeAction(action: Action, devices: Device[], rooms: Room[]): string {
  const device = devices.find((d) => d.id === action.device_id);
  const name = device ? deviceLabel(device, rooms) : action.device_id;
  const s = action.set;
  const parts: string[] = [];
  if (isSet(s.target_c)) parts.push(`auf ${formatNumber(s.target_c, Number.isInteger(s.target_c) ? 0 : 1)} °C`);
  if (isSet(s.position)) {
    parts.push(s.position === 100 ? "schließen" : s.position === 0 ? "öffnen" : `auf ${s.position} % schließen`);
  }
  if (isSet(s.open)) parts.push(s.open ? "öffnen" : "schließen");
  if (isSet(s.on)) parts.push(s.on ? "an" : "aus");
  if (isSet(s.brightness)) parts.push(`Helligkeit ${s.brightness} %`);
  if (isSet(s.program)) parts.push(`Programm ${s.program}`);
  return parts.length > 0 ? `${name} ${parts.join(", ")}` : name;
}

/** German message for a failed request of the automation screen. */
export function automationErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Keine Verbindung zur Simulation. Bitte später erneut versuchen.";
    if (err.status === 404) return "Diese Regel gibt es nicht mehr – sie wurde inzwischen gelöscht.";
    if (err.status === 409) return "Es sind bereits 100 Automationen gespeichert. Bitte zuerst eine Regel löschen.";
    if (err.status === 422) return "Die Regel ist ungültig: Bitte Bedingung, Gerät und Werte prüfen.";
  }
  return fallback;
}

// ------------------------------------------------------------------ the list

export interface AutomationListProps {
  automations: Automation[] | null;
  devices: Device[];
  rooms: Room[];
  /** Id of the rule open in the editor (gets `.is-editing`). */
  editingId: number | null;
  onNew: () => void;
  onEdit: (automation: Automation) => void;
  /** Called after a rule was deleted on the server. */
  onDeleted?: (id: number) => void;
}

/** The design's `rules-list` (design/mockups/automationen.html:49). */
export function AutomationList({ automations, devices, rooms, editingId, onNew, onEdit, onDeleted }: AutomationListProps) {
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const loading = automations === null;
  const activeCount = automations?.filter((a) => a.enabled).length ?? 0;

  const track = async (id: number, work: () => Promise<unknown>, fallback: string) => {
    setPending((p) => new Set(p).add(id));
    setMessage(null);
    try {
      await work();
      return true;
    } catch (err) {
      setMessage(automationErrorMessage(err, fallback));
      return false;
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  };

  const toggle = (a: Automation, enabled: boolean) => {
    void track(a.id, () => setAutomationEnabled(a.id, enabled), "Die Regel konnte nicht umgeschaltet werden.");
  };

  const remove = async (a: Automation) => {
    const ok = await track(a.id, () => deleteAutomation(a.id), "Die Regel konnte nicht gelöscht werden.");
    setConfirmId(null);
    if (ok) onDeleted?.(a.id);
  };

  return (
    <section className="span-5 stack" data-od-id="rules-list" aria-labelledby="rules-title">
      <div className="row row--between">
        <div className="row" style={{ gap: "var(--s-2)" }}>
          <h2 id="rules-title" style={{ fontSize: "var(--fs-lead)" }}>
            Regeln
          </h2>
          <span className="label">
            <span data-rule-count>{activeCount}</span> aktiv eingerichtet
          </span>
        </div>
        <Button size="sm" icon="plus" data-rule-new data-od-id="rule-new" onClick={onNew} disabled={loading} disabledHint="Warte auf die Simulation …">
          Neue Automation
        </Button>
      </div>

      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}

      {loading ? (
        <EmptyState icon="wifi-off" title="Verbinde mit der Simulation …" text="Die Regeln erscheinen, sobald der Simulationszustand da ist." />
      ) : automations.length === 0 ? (
        <EmptyState
          icon="circle-check"
          title="Noch keine Regeln"
          text="Lege mit „Neue Automation“ eine Regel an. Nach einem Zurücksetzen sind die drei Standardregeln wieder da."
        />
      ) : (
        <div>
          {automations.map((a) => {
            const busy = pending.has(a.id);
            const device = devices.find((d) => d.id === a.action.device_id);
            const room = device ? roomName(rooms, device.room_id) : "";
            const classes = ["rule", !a.enabled && "is-off", editingId === a.id && "is-editing"].filter(Boolean).join(" ");
            return (
              <article key={a.id} className={classes} data-name={a.name} data-rule-id={a.id}>
                <div>
                  <h3 className="rule__name">{a.name}</h3>
                  <p className="rule__sentence">
                    <b>Wenn</b> {describeCondition(a.condition, devices, rooms)} <b>dann</b>{" "}
                    {describeAction(a.action, devices, rooms)}
                  </p>
                  <p className="rule__last">
                    {a.last_fired_at
                      ? `Zuletzt ${formatSimTime(a.last_fired_at)}${room ? ` · ${room}` : ""}`
                      : "Noch nicht ausgelöst"}
                    {!a.enabled && " · deaktiviert"}
                  </p>
                </div>
                {confirmId === a.id ? (
                  <div className="row" style={{ gap: "var(--s-2)" }} role="group" aria-label={`${a.name} löschen?`}>
                    <span className="small">Wirklich löschen?</span>
                    <Button size="sm" danger icon="trash-2" disabled={busy} onClick={() => void remove(a)}>
                      Löschen
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => setConfirmId(null)}>
                      Abbrechen
                    </Button>
                  </div>
                ) : (
                  <div className="rule__tools">
                    <IconButton icon="pencil" label={`${a.name} bearbeiten`} data-rule-edit onClick={() => onEdit(a)} />
                    <IconButton
                      icon="trash-2"
                      label={`${a.name} löschen`}
                      data-rule-del
                      disabled={busy}
                      onClick={() => setConfirmId(a.id)}
                    />
                    <Switch
                      checked={a.enabled}
                      label={`${a.name} aktiv`}
                      disabled={busy}
                      onChange={(next) => toggle(a, next)}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default AutomationList;
