import type { CSSProperties, ReactNode } from "react";
import { cx } from "./Button";

interface BoxProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export interface GridProps extends BoxProps {
  /** main-split + region: the two-column page body of the screens. */
  split?: boolean;
}

/** The design's 12-column `.grid` (collapses to one column at 960px). */
export function Grid({ split = false, className, style, children }: GridProps) {
  return (
    <div className={cx("grid", split && "main-split region", className)} style={style}>
      {children}
    </div>
  );
}

export type SpanCols = 3 | 4 | 5 | 7 | 8 | 12;

export interface SpanProps extends BoxProps {
  cols: SpanCols;
  /** Also a `.stack` (vertical rhythm of 24px). */
  stack?: boolean;
  as?: "div" | "section" | "aside";
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/** A grid cell spanning `cols` columns (span-3/4/5/7/8/12). */
export function Span({ cols, stack = false, as = "div", className, style, children, ...aria }: SpanProps) {
  const Tag = as;
  return (
    <Tag className={cx(`span-${cols}`, stack && "stack", className)} style={style} {...aria}>
      {children}
    </Tag>
  );
}

export interface StackProps extends BoxProps {
  /** "sm" = stack-sm (12px gap), "md" = stack (24px gap). */
  size?: "sm" | "md";
}

/** Vertical rhythm: `.stack` / `.stack-sm`. */
export function Stack({ size = "md", className, style, children }: StackProps) {
  return (
    <div className={cx(size === "sm" ? "stack-sm" : "stack", className)} style={style}>
      {children}
    </div>
  );
}

export interface RowProps extends BoxProps {
  /** row--between: push the ends apart. */
  between?: boolean;
}

/** Horizontal, wrapping `.row`. */
export function Row({ between = false, className, style, children }: RowProps) {
  return (
    <div className={cx("row", between && "row--between", className)} style={style}>
      {children}
    </div>
  );
}
