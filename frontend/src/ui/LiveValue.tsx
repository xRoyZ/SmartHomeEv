import type { ReactNode } from "react";
import { cx } from "./Button";
import { Icon, type IconName } from "./Icon";

/** A number in German notation ("21,5", "1.420"); "–" for a missing value. */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return value.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export interface LiveValueProps {
  /** The value; numbers are formatted in German notation. */
  value: number | string | null | undefined;
  /** Fraction digits for a numeric value. */
  decimals?: number;
  /** Unit after the value, set as `<small>`. */
  unit?: string;
  /** small / muted text variants. */
  small?: boolean;
  muted?: boolean;
  className?: string;
  /** Element to render (default span). */
  as?: "span" | "p" | "b";
}

/**
 * A live, tabular (`.num`) value that flashes (`.tick`) whenever it changes,
 * so every update of the simulation is visible (AC-17).
 */
export function LiveValue({ value, decimals = 0, unit, small = false, muted = false, className, as = "span" }: LiveValueProps) {
  const Tag = as;
  const text = typeof value === "number" || value === null || value === undefined ? formatNumber(value, decimals) : value;
  return (
    <Tag className={cx("num", small && "small", muted && "muted", className)}>
      {/* A new key on change remounts the span, which replays the tick animation. */}
      <span key={text} className="tick">
        {text}
      </span>
      {unit && <small>{unit}</small>}
    </Tag>
  );
}

export interface LiveStatusProps {
  /** The current message; announced politely and flashed on change. */
  message: ReactNode;
  /** Key that changes with every new message (defaults to the message text). */
  messageKey?: string | number;
  icon?: IconName;
  id?: string;
  className?: string;
}

/** The design's `.live` status line with `.live-text` (aria-live="polite"). */
export function LiveStatus({ message, messageKey, icon = "radio", id, className }: LiveStatusProps) {
  const key = messageKey ?? (typeof message === "string" ? message : undefined);
  return (
    <p id={id} className={cx("live", className)} aria-live="polite">
      <Icon name={icon} />
      <span key={key} className="live-text tick">
        {message}
      </span>
    </p>
  );
}

export default LiveValue;
