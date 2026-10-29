import type { CSSProperties } from "react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { HistoryPoint } from "../types";
import { cx } from "./Button";
import { formatSimHm, formatSimMs, simTimeToMs } from "./ClockChip";
import { EmptyState } from "./EmptyState";
import { formatNumber } from "./LiveValue";

/** One line of the chart: the shape of HistoryResponse.series. */
export interface TimeChartSeries {
  key: string;
  label: string;
  points: HistoryPoint[];
}

export type SeriesColor = "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "c-out" | "c-solar";
export type SeriesFill = "fill-out" | "fill-solar" | "fill-load";

export interface SeriesStyle {
  color?: SeriesColor;
  /** Dashed line (`.dash`), e.g. the outdoor temperature. */
  dashed?: boolean;
  /** Filled area under the line (`.area` + fill class). */
  fill?: SeriesFill;
}

export interface TimeChartProps {
  series: TimeChartSeries[];
  /** Accessible description of the whole chart (role="img"). */
  ariaLabel: string;
  /** Unit appended to axis labels and legend values ("°", " %", " ppm", " W"). */
  unit?: string;
  /** Fraction digits of the legend values. */
  decimals?: number;
  /** Start / end of the x axis in simulation time (default: first / last point). */
  from?: string;
  to?: string;
  /** The current simulation time: the yellow `.now` line and the `.now-tag`. */
  now?: string;
  /** A dashed `.limit` line, e.g. the CO2 threshold. */
  limit?: { value: number; label: string };
  /** chart--mini: the 180px chart of the room page. */
  mini?: boolean;
  /** Per-series overrides by key; defaults follow the design (see seriesStyle). */
  styles?: Record<string, SeriesStyle>;
  /** Text of the empty state when there is no point yet. */
  emptyText?: string;
  className?: string;
}

/* Series colours and fills are the design's (design/mockups/styles.css "charts":
   .c1–.c6, .c-out, .c-solar, .fill-out, .fill-solar, .fill-load). Recharts sets
   stroke/fill as attributes on its paths, so the values are passed explicitly. */
const STROKES: Record<SeriesColor, string> = {
  c1: "var(--s1)",
  c2: "var(--s2)",
  c3: "var(--s3)",
  c4: "var(--s4)",
  c5: "var(--s5)",
  c6: "var(--s6)",
  "c-out": "var(--ink-2)",
  "c-solar": "var(--accent)",
};
const FILLS: Record<SeriesFill, string> = {
  "fill-out": "oklch(0.31 0.03 255 / 0.75)",
  "fill-solar": "oklch(0.84 0.15 85 / 0.28)",
  "fill-load": "oklch(0.84 0.015 255 / 0.2)",
};
const ROOM_COLORS: SeriesColor[] = ["c1", "c2", "c3", "c4", "c5", "c6"];

/** The design's style for a series key: outdoor dashed with fill, power and solar as areas, rooms c1–c6. */
export function seriesStyle(key: string, index: number, overrides?: Record<string, SeriesStyle>): Required<Pick<SeriesStyle, "color">> & SeriesStyle {
  const base: SeriesStyle =
    key === "aussen"
      ? { color: "c-out", dashed: true, fill: "fill-out" }
      : key === "solar"
        ? { color: "c-solar", fill: "fill-solar" }
        : key === "verbrauch"
          ? { color: "c-out", fill: "fill-load" }
          : { color: ROOM_COLORS[index % ROOM_COLORS.length] };
  const merged = { ...base, ...overrides?.[key] };
  return { ...merged, color: merged.color ?? "c1" };
}

/** Evenly spaced "nice" axis values covering [min, max]. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? 10 * mag) as number;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

type Row = { ts: number } & Record<string, number>;

const varStyle = (name: string, value: string | number) => ({ [name]: value }) as CSSProperties;

/**
 * Simulated values over simulation time (design/mockups/verlauf.html chart):
 * y labels, grid lines, areas, lines, the "now" line with its tag and the
 * legend with each series' latest value. Drawn with Recharts.
 */
export function TimeChart({
  series,
  ariaLabel,
  unit = "",
  decimals = 0,
  from,
  to,
  now,
  limit,
  mini = false,
  styles,
  emptyText = "Der Verlauf füllt sich, während die Simulation läuft.",
  className,
}: TimeChartProps) {
  const rowsByTs = new Map<number, Row>();
  let vMin = Number.POSITIVE_INFINITY;
  let vMax = Number.NEGATIVE_INFINITY;
  series.forEach((s, i) => {
    for (const p of s.points) {
      const ts = simTimeToMs(p.t);
      if (!Number.isFinite(ts) || !Number.isFinite(p.v)) continue;
      const row = rowsByTs.get(ts) ?? ({ ts } as Row);
      row[`s${i}`] = p.v;
      rowsByTs.set(ts, row);
      vMin = Math.min(vMin, p.v);
      vMax = Math.max(vMax, p.v);
    }
  });
  const rows = [...rowsByTs.values()].sort((a, b) => a.ts - b.ts);

  if (rows.length === 0) {
    return <EmptyState icon="activity" title="Noch keine Messwerte" text={emptyText} className={className} />;
  }

  if (limit) {
    vMin = Math.min(vMin, limit.value);
    vMax = Math.max(vMax, limit.value);
  }
  const ticks = niceTicks(vMin, vMax, mini ? 3 : 4);
  const yLo = ticks[0];
  const yHi = ticks[ticks.length - 1];
  const tickDecimals = ticks.some((t) => !Number.isInteger(t)) ? 1 : 0;

  const fromMs = from ? simTimeToMs(from) : rows[0].ts;
  const nowMs = now ? simTimeToMs(now) : Number.NaN;
  const toCandidates = [to ? simTimeToMs(to) : rows[rows.length - 1].ts, nowMs].filter(Number.isFinite);
  const xLo = Number.isFinite(fromMs) ? Math.min(fromMs, rows[0].ts) : rows[0].ts;
  const xHi = Math.max(...toCandidates, rows[rows.length - 1].ts, xLo + 1);
  const xLabelCount = mini ? 3 : 5;
  const xLabels = Array.from({ length: xLabelCount }, (_, i) => formatSimMs(xLo + ((xHi - xLo) * i) / (xLabelCount - 1)));

  // Room colours c1–c6 count only the room series, so "aussen" first does not shift them.
  let roomIndex = 0;
  const styled = series.map((s, i) => {
    const special = s.key === "aussen" || s.key === "solar" || s.key === "verbrauch";
    const st = seriesStyle(s.key, special ? 0 : roomIndex, styles);
    if (!special) roomIndex += 1;
    return { s, i, st };
  });

  return (
    <div className={cx("time-chart", className)}>
      <div className={cx("chart", mini && "chart--mini")} role="img" aria-label={ariaLabel}>
        <div className="chart__y" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={varStyle("--p", ((yHi - t) / (yHi - yLo)) * 100)}>
              {formatNumber(t, tickDecimals)}
              {unit}
            </span>
          ))}
        </div>
        <div className="chart__plot">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: mini ? 180 : 320 }}>
            <ComposedChart data={rows} margin={{ top: 0, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <XAxis dataKey="ts" type="number" domain={[xLo, xHi]} hide allowDataOverflow />
              <YAxis type="number" domain={[yLo, yHi]} hide allowDataOverflow />
              {ticks.map((t) => (
                <ReferenceLine key={`gl-${t}`} y={t} className="gl" stroke="var(--line)" strokeWidth={1} />
              ))}
              {styled
                .filter(({ st }) => st.fill)
                .map(({ s, i, st }) => (
                  <Area
                    key={`area-${s.key}`}
                    dataKey={`s${i}`}
                    className={cx("area", st.fill)}
                    fill={FILLS[st.fill as SeriesFill]}
                    fillOpacity={1}
                    stroke="none"
                    baseValue="dataMin"
                    connectNulls
                    isAnimationActive={false}
                    dot={false}
                    activeDot={false}
                  />
                ))}
              {limit && (
                <ReferenceLine
                  y={limit.value}
                  className="limit"
                  stroke="var(--alarm-soft)"
                  strokeWidth={1.5}
                  strokeDasharray="6 5"
                />
              )}
              {styled.map(({ s, i, st }) => (
                <Line
                  key={`ln-${s.key}`}
                  dataKey={`s${i}`}
                  name={s.label}
                  className={cx("ln", st.color, st.dashed && "dash")}
                  stroke={STROKES[st.color]}
                  strokeWidth={2.5}
                  strokeDasharray={st.dashed ? "7 6" : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  connectNulls
                  isAnimationActive={false}
                  dot={false}
                  activeDot={false}
                />
              ))}
              {Number.isFinite(nowMs) && (
                <ReferenceLine x={Math.min(nowMs, xHi)} className="now" stroke="var(--accent)" strokeWidth={2} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          {Number.isFinite(nowMs) && <span className="now-tag">{mini ? "Jetzt" : `Jetzt ${formatSimHm(now)}`}</span>}
        </div>
        <div className="chart__x" aria-hidden="true">
          {xLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      </div>
      <div className="legend legend--row" style={{ marginTop: mini ? "var(--s-3)" : "var(--s-4)" }}>
        {styled.map(({ s, st }) => {
          const last = s.points.length > 0 ? s.points[s.points.length - 1].v : null;
          return (
            <p key={s.key} className={cx("legend__item", st.dashed && "legend__item--dash", st.color)}>
              {s.label}
              <b className="num">
                {formatNumber(last, decimals)}
                {last !== null ? unit : ""}
              </b>
            </p>
          );
        })}
        {limit && (
          <p className="legend__item legend__item--dash" style={varStyle("--c", "var(--alarm-soft)")}>
            {limit.label}
            <b className="num">
              {formatNumber(limit.value, decimals)}
              {unit}
            </b>
          </p>
        )}
      </div>
    </div>
  );
}

export default TimeChart;
