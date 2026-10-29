import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "./Button";
import { Icon, type IconName } from "./Icon";
import { formatNumber } from "./LiveValue";

export interface FigureProps {
  /** The value; numbers are formatted in German notation. */
  value: number | string | null | undefined;
  decimals?: number;
  /** Unit, set small after the value ("°", "kW", "%"). */
  unit?: string;
  /** Optional `.label` above the figure. */
  label?: ReactNode;
  className?: string;
}

/**
 * The design's `.figure`: a large display number with its unit
 * (design/mockups/index.html:99). Flashes on change.
 */
export function Figure({ value, decimals = 0, unit, label, className }: FigureProps) {
  const text = typeof value === "number" || value === null || value === undefined ? formatNumber(value, decimals) : value;
  const figure = (
    <span className={cx("figure num", className)}>
      <span key={text} className="tick">
        {text}
      </span>
      {unit && <small>{unit}</small>}
    </span>
  );
  if (label === undefined) return figure;
  return (
    <span className="stack-sm" style={{ gap: "6px" }}>
      <span className="label">{label}</span>
      {figure}
    </span>
  );
}

export interface TextLinkProps {
  /** In-app route. */
  to: string;
  icon?: IconName;
  className?: string;
  children: ReactNode;
}

/** The design's underlined `.link` (e.g. "Alle Alarme", design/mockups/index.html:270). */
export function TextLink({ to, icon, className, children }: TextLinkProps) {
  return (
    <Link className={cx("link", className)} to={to}>
      {icon && <Icon name={icon} />}
      {children}
    </Link>
  );
}

export default Figure;
