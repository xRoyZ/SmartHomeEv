import type { ReactNode } from "react";
import { cx } from "./Button";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps {
  /** Headline, e.g. "Alles ruhig". */
  title: ReactNode;
  /** Explanation under it. */
  text?: ReactNode;
  /** Default circle-check (the calm "nothing to report" of the design). */
  icon?: IconName;
  className?: string;
  children?: ReactNode;
}

/** The design's `.empty` box (design/mockups/index.html:309). */
export function EmptyState({ title, text, icon = "circle-check", className, children }: EmptyStateProps) {
  return (
    <div className={cx("empty", className)} role="status">
      <Icon name={icon} />
      <strong>{title}</strong>
      {text !== undefined && <p className="small">{text}</p>}
      {children}
    </div>
  );
}

export default EmptyState;
