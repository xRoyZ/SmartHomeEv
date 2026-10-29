import { useState } from "react";
import { triggerEvent } from "../../api/client";
import { EVENT_TYPE_LABELS, ROOM_LABELS } from "../../labels";
import type { ActiveEvent, EventType } from "../../types";
import { cx, Icon, LiveStatus, type IconName } from "../../ui";
import { settingsErrorText, type StatusReporter, type StatusTone } from "./SimulationSettingsForm";

interface EventMeta {
  icon: IconName;
  desc: string;
  variant?: "lead" | "wide";
}

/** Icon, description and tile size per event (design/mockups/simulation.html:94-167). */
const EVENT_META: Record<EventType, EventMeta> = {
  fenster_vergessen: { icon: "door-open", desc: "Ein Fenster bleibt bei laufender Heizung offen.", variant: "lead" },
  wasserschaden: { icon: "droplets", desc: "Der Leckmelder in Bad oder Küche schlägt an.", variant: "wide" },
  rauch_kueche: { icon: "flame", desc: "Der Rauchmelder löst aus." },
  stromspitze: { icon: "zap", desc: "Der Verbrauch springt plötzlich hoch." },
  heizungsausfall: { icon: "thermometer-snowflake", desc: "Alle Heizkörper hören auf zu heizen." },
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];

export const DEFAULT_EVENT_STATUS = "Ereignisse wirken sofort und erscheinen auf allen verbundenen Geräten.";

export interface EventTriggersProps {
  activeEvents: ActiveEvent[];
  /** The page's live status line (design "sim-status"). */
  status: { message: string; tone: StatusTone } | null;
  onStatus: StatusReporter;
}

function firedText(ev: ActiveEvent): string {
  const label = EVENT_TYPE_LABELS[ev.type];
  const where = ev.room_id ? ` (${ROOM_LABELS[ev.room_id]})` : "";
  return `${label}${where} ausgelöst – der Alarm erscheint in der Übersicht und unter Alarme.`;
}

/** The "Ereignisse auslösen" tiles, one per EventType, and the live status line. */
export function EventTriggers({ activeEvents, status, onStatus }: EventTriggersProps) {
  const [pending, setPending] = useState<EventType | null>(null);

  async function fire(type: EventType): Promise<void> {
    setPending(type);
    try {
      const ev = await triggerEvent(type);
      onStatus(firedText(ev), "ok");
    } catch (err) {
      onStatus(`${EVENT_TYPE_LABELS[type]} nicht ausgelöst: ${settingsErrorText(err)}`, "error");
    } finally {
      setPending(null);
    }
  }

  const icon: IconName = status?.tone === "error" ? "circle-alert" : status?.tone === "ok" ? "circle-check" : "radio";

  return (
    <section className="span-7 stack" data-od-id="events" aria-labelledby="events-title">
      <h2 id="events-title" style={{ fontSize: "var(--fs-lead)" }}>
        Ereignisse auslösen
      </h2>
      <div className="events">
        {EVENT_TYPES.map((type) => {
          const meta = EVENT_META[type];
          const active = activeEvents.some((e) => e.type === type);
          const busy = pending === type;
          const stateText = busy ? "Wird ausgelöst …" : active ? "Aktiv" : "Bereit";
          return (
            <button
              key={type}
              type="button"
              className={cx(
                "event-btn",
                meta.variant === "lead" && "event-btn--lead",
                meta.variant === "wide" && "event-btn--wide",
                active && "is-fired",
              )}
              data-event={type}
              disabled={pending !== null}
              onClick={() => void fire(type)}
            >
              <Icon name={meta.icon} />
              <span>
                <span className="event-btn__title">{EVENT_TYPE_LABELS[type]}</span>
                <span className="event-btn__desc">{meta.desc}</span>
                <span className="event-btn__status">{stateText}</span>
              </span>
            </button>
          );
        })}
      </div>
      <LiveStatus id="sim-status" icon={icon} message={status?.message ?? DEFAULT_EVENT_STATUS} />
    </section>
  );
}

export default EventTriggers;
