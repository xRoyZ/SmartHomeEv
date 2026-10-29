import { useId } from "react";
import { cx } from "./Button";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface ChipsProps<T extends string> {
  /** Visible group label (`.label`); also names the group. */
  label: string;
  hideLabel?: boolean;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The whole group is unavailable (aria-disabled, greyed out). */
  disabled?: boolean;
  /** Why the group is unavailable; shown while disabled. */
  disabledHint?: string;
  className?: string;
}

/**
 * The design's `.chips` / `.chip`: single choice among pills
 * (design/mockups/simulation.html conditions, verlauf.html rooms).
 */
export function Chips<T extends string>({
  label,
  hideLabel = false,
  options,
  value,
  onChange,
  disabled = false,
  disabledHint,
  className,
}: ChipsProps<T>) {
  const labelId = useId();
  const hintId = useId();
  const showHint = disabled && Boolean(disabledHint);
  return (
    <div className="stack-sm">
      <span className={hideLabel ? "sr-only" : "label"} id={labelId}>
        {label}
      </span>
      <div
        className={cx("chips", className)}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={showHint ? hintId : undefined}
      >
        {options.map((o) => {
          const off = disabled || Boolean(o.disabled);
          return (
            <button
              key={o.value}
              type="button"
              className="chip"
              aria-pressed={o.value === value}
              aria-disabled={off || undefined}
              onClick={() => {
                if (!off && o.value !== value) onChange(o.value);
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {showHint && (
        <p id={hintId} className="small muted">
          {disabledHint}
        </p>
      )}
    </div>
  );
}

export default Chips;
