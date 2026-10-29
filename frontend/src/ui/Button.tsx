import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** Joins class names, dropping empty ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type">;

export interface ButtonProps extends NativeButtonProps {
  /** btn-primary (accent) or btn-secondary (outline, the default). */
  variant?: "primary" | "secondary";
  /** btn-sm: the compact 36px height (44px again on phones). */
  size?: "md" | "sm";
  /** is-danger: the destructive outline (reset). Only with variant "secondary". */
  danger?: boolean;
  /** Leading icon. */
  icon?: IconName;
  /** Toggle state (aria-pressed). With whenOn/whenOff the label follows it. */
  pressed?: boolean;
  /** Label while pressed (aria-pressed="true"). */
  whenOn?: ReactNode;
  /** Label while not pressed (aria-pressed="false"). */
  whenOff?: ReactNode;
  /** Why the button is unavailable; shown next to it while disabled. */
  disabledHint?: string;
  type?: "button" | "submit" | "reset";
  children?: ReactNode;
}

/** Wraps a control with the visible reason it is disabled (AC-16). */
function WithHint({ hint, hintId, children }: { hint?: string; hintId: string; children: ReactNode }) {
  if (!hint) return <>{children}</>;
  return (
    <span className="row" style={{ gap: "var(--s-1)" }}>
      {children}
      <span id={hintId} className="small muted">
        {hint}
      </span>
    </span>
  );
}

/**
 * The design's `.btn` (design/mockups/styles.css "buttons"): primary,
 * secondary, small, danger, toggle (aria-pressed with when-on/when-off labels)
 * and disabled with a visible hint.
 */
export function Button({
  variant = "secondary",
  size = "md",
  danger = false,
  icon,
  pressed,
  whenOn,
  whenOff,
  disabledHint,
  disabled,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const hintId = useId();
  const showHint = Boolean(disabled && disabledHint);
  const toggleLabels = pressed !== undefined && (whenOn !== undefined || whenOff !== undefined);

  return (
    <WithHint hint={showHint ? disabledHint : undefined} hintId={hintId}>
      <button
        {...rest}
        type={type}
        disabled={disabled}
        aria-pressed={pressed}
        aria-describedby={showHint ? hintId : rest["aria-describedby"]}
        className={cx(
          "btn",
          variant === "primary" ? "btn-primary" : "btn-secondary",
          size === "sm" && "btn-sm",
          danger && variant === "secondary" && "is-danger",
          className,
        )}
      >
        {icon && <Icon name={icon} />}
        {toggleLabels ? (
          <>
            <span className="when-off">{whenOff}</span>
            <span className="when-on">{whenOn}</span>
          </>
        ) : (
          children
        )}
      </button>
    </WithHint>
  );
}

export interface IconButtonProps extends NativeButtonProps {
  icon: IconName;
  /** Accessible name (the button shows only the icon). */
  label: string;
  /** is-round: the outlined circle of the steppers. */
  round?: boolean;
  /** Why the button is unavailable; shown next to it while disabled. */
  disabledHint?: string;
}

/** The design's `.btn-icon` (44px circle), optionally `.is-round`. */
export function IconButton({ icon, label, round = false, disabledHint, disabled, className, ...rest }: IconButtonProps) {
  const hintId = useId();
  const showHint = Boolean(disabled && disabledHint);
  return (
    <WithHint hint={showHint ? disabledHint : undefined} hintId={hintId}>
      <button
        {...rest}
        type="button"
        disabled={disabled}
        aria-label={label}
        title={label}
        aria-describedby={showHint ? hintId : rest["aria-describedby"]}
        className={cx("btn-icon", round && "is-round", className)}
      >
        <Icon name={icon} />
      </button>
    </WithHint>
  );
}

export default Button;
