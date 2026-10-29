import { useId } from "react";
import { cx } from "./Button";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string | number> {
  /** Visible group label (`.label`); also names the group. */
  label: string;
  /** Hide the visible label (the group keeps it as its accessible name). */
  hideLabel?: boolean;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** seg--ink: the ink-filled variant of the history filter. */
  ink?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * The design's `.seg`: one pressed button per group
 * (design/mockups/index.html:54 tempo, verlauf.html metric).
 */
export function Segmented<T extends string | number>({
  label,
  hideLabel = false,
  options,
  value,
  onChange,
  ink = false,
  disabled = false,
  className,
}: SegmentedProps<T>) {
  const labelId = useId();
  return (
    <div className="stack-sm">
      <span className={hideLabel ? "sr-only" : "label"} id={labelId}>
        {label}
      </span>
      <div className={cx("seg", ink && "seg--ink", className)} role="group" aria-labelledby={labelId}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            disabled={disabled || o.disabled}
            onClick={() => {
              if (o.value !== value) onChange(o.value);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default Segmented;
