import { useId, type ReactNode } from "react";
import { cx } from "./Button";

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name, rendered as sr-only text inside the switch. */
  label: string;
  /** Visible state text next to the switch while on / off (e.g. "an" / "aus"). */
  whenOn?: ReactNode;
  whenOff?: ReactNode;
  disabled?: boolean;
  /** Why the switch is unavailable; shown while disabled. */
  disabledHint?: string;
  className?: string;
}

/**
 * The design's `.switch` (role="switch", aria-checked), with an optional
 * `.switch-text` that follows the state (design/mockups/raum.html devices).
 */
export function Switch({ checked, onChange, label, whenOn, whenOff, disabled = false, disabledHint, className }: SwitchProps) {
  const hintId = useId();
  const hasText = whenOn !== undefined || whenOff !== undefined;
  const showHint = disabled && Boolean(disabledHint);
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-describedby={showHint ? hintId : undefined}
      disabled={disabled}
      className={cx("switch", className)}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
    >
      <span className="sr-only">{label}</span>
    </button>
  );
  if (!hasText && !showHint) return control;
  return (
    <span className="row" style={{ gap: "var(--s-1)", flexWrap: "nowrap" }}>
      {control}
      {hasText && (
        <span className="switch-text" aria-hidden="true">
          {checked ? <span className="when-on">{whenOn}</span> : <span className="when-off">{whenOff}</span>}
        </span>
      )}
      {showHint && (
        <span id={hintId} className="small muted">
          {disabledHint}
        </span>
      )}
    </span>
  );
}

export default Switch;
