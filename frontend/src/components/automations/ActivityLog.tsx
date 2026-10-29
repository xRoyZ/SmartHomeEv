import { Fragment } from "react";
import { ACTIVITY_SOURCE_LABELS } from "../../labels";
import type { ActivityEntry } from "../../types";
import { EmptyState, formatSimDay, formatSimHm } from "../../ui";

/** The calendar day ("2026-01-14") of a naive simulation time. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** "Heute, Mittwoch" / "Gestern, Dienstag" / "Montag, 12.01." relative to the simulation clock. */
export function dayLabel(entryTime: string, now: string | null | undefined): string {
  const day = dayOf(entryTime);
  const weekday = formatSimDay(entryTime, true);
  if (now) {
    const today = dayOf(now);
    if (day === today) return `Heute, ${weekday}`;
    if (day === previousDay(today)) return `Gestern, ${weekday}`;
  }
  const [, month, date] = day.split("-");
  return month && date ? `${weekday}, ${date}.${month}.` : weekday;
}

export interface ActivityLogProps {
  /** state.activity, newest first; null while no state has arrived. */
  entries: ActivityEntry[] | null;
  /** The simulation clock's time, for "Heute" / "Gestern". */
  now: string | null;
}

/** The design's `activity-log` (design/mockups/automationen.html:233), in simulation time. */
export function ActivityLog({ entries, now }: ActivityLogProps) {
  return (
    <section className="span-3 stack" data-od-id="activity-log" aria-labelledby="log-title">
      <h2 id="log-title" style={{ fontSize: "var(--fs-lead)" }}>
        Aktivitätsprotokoll
      </h2>
      {entries === null ? (
        <EmptyState icon="wifi-off" title="Verbinde mit der Simulation …" />
      ) : entries.length === 0 ? (
        <EmptyState title="Noch keine Einträge" text="Hier erscheint alles, was Automationen, Ereignisse und Bedienung im Haus auslösen." />
      ) : (
        <div className="log hair" aria-label="Protokoll in Simulationszeit">
          {entries.map((entry, i) => {
            const startsDay = i === 0 || dayOf(entries[i - 1].sim_time) !== dayOf(entry.sim_time);
            return (
              <Fragment key={`${entry.sim_time}-${i}-${entry.message}`}>
                {startsDay && (
                  <p
                    className="label"
                    style={i === 0 ? { paddingBottom: "var(--s-1)" } : { paddingBlock: "var(--s-3) var(--s-1)" }}
                  >
                    {dayLabel(entry.sim_time, now)}
                  </p>
                )}
                <div className={i === 0 ? "log__row is-latest" : "log__row"} data-source={entry.source}>
                  <time className="log__time" dateTime={entry.sim_time} title="Simulationszeit">
                    {formatSimHm(entry.sim_time)}
                  </time>
                  <div>
                    <b>{entry.message}</b>
                    <span>{ACTIVITY_SOURCE_LABELS[entry.source] ?? entry.source}</span>
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ActivityLog;
