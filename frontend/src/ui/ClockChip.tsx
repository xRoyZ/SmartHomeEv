import type { Clock } from "../types";
import { SPEED_LABELS } from "../labels";
import { cx } from "./Button";
import { Icon } from "./Icon";

const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
const DAYS_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"] as const;

interface SimParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Splits a naive ISO-8601 simulation time ("2026-01-14T07:42:00") without any time zone shift. */
function parseSimTime(iso: string | null | undefined): SimParts | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] };
}

/**
 * Simulation time as milliseconds on a zone-free axis (UTC is used only as a
 * neutral calendar), for charts and differences. NaN when unparsable.
 */
export function simTimeToMs(iso: string): number {
  const p = parseSimTime(iso);
  if (!p) return Number.NaN;
  const sec = /T\d{2}:\d{2}:(\d{2})/.exec(iso);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, sec ? +sec[1] : 0);
}

function weekday(p: SimParts): number {
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "07:42" of a simulation time; "--:--" when unknown. */
export function formatSimHm(iso: string | null | undefined): string {
  const p = parseSimTime(iso);
  return p ? `${pad(p.hour)}:${pad(p.minute)}` : "--:--";
}

/** "Mi" of a simulation time; "" when unknown. */
export function formatSimDay(iso: string | null | undefined, long = false): string {
  const p = parseSimTime(iso);
  if (!p) return "";
  return long ? DAYS_LONG[weekday(p)] : DAYS[weekday(p)];
}

/** "Mi 07:42" of a simulation time; "--:--" when unknown. */
export function formatSimTime(iso: string | null | undefined): string {
  const p = parseSimTime(iso);
  return p ? `${DAYS[weekday(p)]} ${pad(p.hour)}:${pad(p.minute)}` : "--:--";
}

/** "Mi 07:42" of milliseconds produced by simTimeToMs. */
export function formatSimMs(ms: number): string {
  if (!Number.isFinite(ms)) return "--:--";
  const d = new Date(ms);
  return `${DAYS[d.getUTCDay()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export interface ClockChipProps {
  /** The simulation clock; null while no state has arrived. */
  clock: Clock | null;
  className?: string;
}

/**
 * The header's `.clock-chip`: "Mi 07:42 · 60x" in simulation time, or
 * "· Pausiert" while the clock stands (design/mockups/alarme.html:25).
 */
export function ClockChip({ clock, className }: ClockChipProps) {
  const time = formatSimTime(clock?.sim_time);
  const tempo = clock === null ? "" : clock.paused ? "Pausiert" : SPEED_LABELS[clock.speed] ?? `${clock.speed}x`;
  const label =
    clock === null
      ? "Simulationszeit noch unbekannt"
      : `Simulationszeit ${time}, ${clock.paused ? "pausiert" : `Tempo ${tempo}`}`;
  return (
    <span className={cx("clock-chip", className)} title={label} data-paused={clock?.paused ? "true" : undefined}>
      <Icon name="clock" />
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">
        <span key={time} className="tick">
          {time}
        </span>
        {tempo && ` · ${tempo}`}
      </span>
    </span>
  );
}

export default ClockChip;
