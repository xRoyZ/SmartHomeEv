import type { ReactNode } from "react";
import { cx } from "./Button";

export interface PanelProps {
  /** Heading of the panel (panel__title); omit for a bare surface. */
  title?: ReactNode;
  /** Id of the heading, so a section can be labelled by it. */
  titleId?: string;
  /** Content at the end of the head row (a count, a button). */
  headEnd?: ReactNode;
  /** Rendered element: a labelled `section` (default) or a plain `div`. */
  as?: "section" | "div";
  className?: string;
  children?: ReactNode;
}

/** The design's `.panel` surface with its optional `.panel__head`. */
export function Panel({ title, titleId, headEnd, as = "section", className, children }: PanelProps) {
  const Tag = as;
  const head =
    title !== undefined || headEnd !== undefined ? (
      <div className="panel__head">
        {title !== undefined && (
          <h2 id={titleId} className="panel__title">
            {title}
          </h2>
        )}
        {headEnd}
      </div>
    ) : null;
  return (
    <Tag className={cx("panel", className)} aria-labelledby={as === "section" && title !== undefined ? titleId : undefined}>
      {head}
      {children}
    </Tag>
  );
}

export default Panel;
