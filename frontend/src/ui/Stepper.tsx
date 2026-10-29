import type { CSSProperties } from "react";
import { IconButton } from "./Button";
import { formatNumber } from "./LiveValue";

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Fraction digits shown (e.g. 1 for "21,5"). */
  decimals?: number;
  /** Unit after the value ("°", "ppm", "W"). */
  unit?: string;
  /** Accessible name of the whole control, e.g. "Zieltemperatur". */
  label: string;
  /** Names of the two buttons (default "<label> senken/erhöhen"). */
  decLabel?: string;
  incLabel?: string;
  onChange: (next: number) => void;
  disabled?: boolean;
  /** Wider value box for four-digit values (the design's 5.4ch). */
  valueMinWidth?: string;
}

/** Clamps and rounds one step away from `value` (no float drift like 21.499999). */
export function stepValue(value: number, dir: -1 | 1, step: number, min: number, max: number): number {
  const next = Math.round((value + dir * step) * 1000) / 1000;
  return Math.min(max, Math.max(min, next));
}

/**
 * The design's `.stepper`: minus, value, plus (design/mockups/alarme.html:174).
 * A button is disabled at its bound, so it never silently does nothing.
 */
export function Stepper({
  value,
  min,
  max,
  step,
  decimals = 0,
  unit,
  label,
  decLabel,
  incLabel,
  onChange,
  disabled = false,
  valueMinWidth,
}: StepperProps) {
  const text = formatNumber(value, decimals);
  const style: CSSProperties | undefined = valueMinWidth ? { minWidth: valueMinWidth } : undefined;
  return (
    <div className="stepper" role="group" aria-label={label}>
      <IconButton
        icon="minus"
        round
        label={decLabel ?? `${label} senken`}
        disabled={disabled || value <= min}
        onClick={() => onChange(stepValue(value, -1, step, min, max))}
      />
      <span className="stepper__value" style={style} aria-live="polite">
        <span key={text} className="tick">
          {text}
        </span>
        {unit && <small>{unit.trim()}</small>}
      </span>
      <IconButton
        icon="plus"
        round
        label={incLabel ?? `${label} erhöhen`}
        disabled={disabled || value >= max}
        onClick={() => onChange(stepValue(value, 1, step, min, max))}
      />
    </div>
  );
}

export default Stepper;
