import type { CSSProperties } from "react";
import type { HistoryMetric, HistoryResponse, Solar, Thresholds } from "../../types";
import { EmptyState, formatNumber, LiveStatus, TimeChart, type TimeChartSeries } from "../../ui";

export interface HistoryChartProps {
  /** The metric selected in the filters (the response may still be for the previous one). */
  metric: HistoryMetric;
  /** The last response of GET /api/history, or null before the first one. */
  data: HistoryResponse | null;
  loading: boolean;
  /** German error message of the last failed request, or null. */
  error: string | null;
  /** Hours the chart covers. */
  hours: number;
  /** The selected room's name, or null for all rooms. */
  roomName: string | null;
  /** Current simulation time: the chart's "Jetzt" line. */
  now?: string;
  thresholds?: Thresholds | null;
  /** Current solar balance for the "Netzbezug / Einspeisung" legend entry of the power chart. */
  solar?: Solar | null;
}

interface MetricView {
  title: string;
  aria: string;
  unit: string;
  decimals: number;
  /** Factor applied to every value (W -> kW for power). */
  scale: number;
}

function metricView(metric: HistoryMetric, roomName: string | null, hours: number): MetricView {
  const span = `letzte ${hours} Stunden Simulationszeit`;
  switch (metric) {
    case "temperature":
      return {
        title: roomName ? `Temperatur ${roomName} gegen Außen` : "Raumtemperaturen gegen Außen",
        aria: `${roomName ? `Temperatur ${roomName}` : "Raumtemperaturen"} gegenüber der Außentemperatur, ${span}`,
        unit: "°",
        decimals: 1,
        scale: 1,
      };
    case "humidity":
      return {
        title: roomName ? `Luftfeuchte ${roomName}` : "Luftfeuchte je Raum",
        aria: `Luftfeuchte ${roomName ?? "je Raum"}, ${span}`,
        unit: " %",
        decimals: 0,
        scale: 1,
      };
    case "co2":
      return {
        title: roomName ? `CO2-Konzentration ${roomName}` : "CO2-Konzentration je Raum",
        aria: `CO2-Konzentration ${roomName ?? "je Raum"} mit Grenzwert, ${span}`,
        unit: " ppm",
        decimals: 0,
        scale: 1,
      };
    case "power":
      return {
        title: "Verbrauch gegen Solarertrag",
        aria: `Verbrauch gegenüber Solarertrag des ganzen Hauses, ${span}`,
        unit: " kW",
        decimals: 1,
        scale: 0.001,
      };
  }
}

/** Rooms first, then the outdoor series; consumption before solar (the design's legend order). */
function orderSeries(series: TimeChartSeries[]): TimeChartSeries[] {
  const rank = (key: string) => (key === "aussen" ? 2 : key === "solar" ? 1 : 0);
  return [...series].sort((a, b) => rank(a.key) - rank(b.key));
}

/**
 * The limit line of the chart. The kit draws one limit, so for temperature the
 * bound the rooms are nearer to is shown (the lower one in a cold house).
 */
function limitFor(
  metric: HistoryMetric,
  thresholds: Thresholds | null | undefined,
  series: TimeChartSeries[],
): { value: number; label: string } | undefined {
  if (!thresholds) return undefined;
  if (metric === "co2") return { value: thresholds.co2_max_ppm, label: "Grenze" };
  if (metric === "power") return { value: thresholds.power_max_w / 1000, label: "Grenze" };
  if (metric === "temperature") {
    const latest = series
      .filter((s) => s.key !== "aussen" && s.points.length > 0)
      .map((s) => s.points[s.points.length - 1].v);
    const mid = (thresholds.room_min_c + thresholds.room_max_c) / 2;
    const warm = latest.length > 0 && Math.max(...latest) >= mid;
    return warm
      ? { value: thresholds.room_max_c, label: "Obergrenze" }
      : { value: thresholds.room_min_c, label: "Untergrenze" };
  }
  return undefined;
}

/** The design's `history-chart` region (design/mockups/verlauf.html:72). */
export function HistoryChart({ metric, data, loading, error, hours, roomName, now, thresholds, solar }: HistoryChartProps) {
  const view = metricView(metric, roomName, hours);
  // A response for another metric belongs to the previous filter: not shown.
  const current = data && data.metric === metric ? data : null;
  const series: TimeChartSeries[] = current
    ? orderSeries(
        current.series.map((s) => ({
          key: s.key,
          label: s.label,
          points: s.points.map((p) => ({ t: p.t, v: p.v * view.scale })),
        })),
      )
    : [];
  const hasPoints = series.some((s) => s.points.length > 0);
  const limit = limitFor(metric, thresholds, series);

  let body;
  if (!current && error) {
    body = <EmptyState icon="circle-alert" title="Verlauf nicht verfügbar" text={error} />;
  } else if (!current) {
    body = (
      <p className="small muted" role="status">
        Verlauf wird geladen …
      </p>
    );
  } else if (!hasPoints) {
    body = (
      <EmptyState
        icon="activity"
        title="Noch keine Messwerte"
        text="Der Verlauf füllt sich, während die Simulation läuft."
      />
    );
  } else {
    body = (
      <TimeChart
        series={series}
        ariaLabel={view.aria}
        unit={view.unit}
        decimals={view.decimals}
        from={current.from_time}
        to={current.to_time}
        now={now}
        limit={limit}
      />
    );
  }

  const balance = solar?.balance_w;
  return (
    <section
      className="region"
      style={{ paddingTop: "var(--s-6)" }}
      data-od-id="history-chart"
      aria-labelledby="history-chart-title"
      aria-busy={loading || undefined}
    >
      <div className="row row--between" style={{ marginBottom: "var(--s-4)", alignItems: "baseline" }}>
        <h2 id="history-chart-title" style={{ fontSize: "var(--fs-lead)" }}>
          {view.title}
        </h2>
        <p className="label">Letzte {hours} Stunden (Simulationszeit)</p>
      </div>

      {current && error && (
        <p className="small muted" role="alert" style={{ marginBottom: "var(--s-3)" }}>
          {error}
        </p>
      )}

      {body}

      {metric === "power" && current && hasPoints && balance !== undefined && (
        <div className="legend legend--row" style={{ marginTop: "var(--s-2)" }}>
          <p className="legend__item" style={{ "--c": "var(--line-strong)" } as CSSProperties}>
            {balance < 0 ? "Netzbezug" : "Einspeisung"}
            <b className="num">{formatNumber(Math.abs(balance) / 1000, 1)} kW</b>
          </p>
        </div>
      )}
      {metric === "power" && (
        <p className="small muted" style={{ marginTop: "var(--s-2)" }}>
          Der Verbrauch gilt für das ganze Haus, deshalb gilt die Raumauswahl hier nicht.
        </p>
      )}

      <div style={{ marginTop: "var(--s-4)" }}>
        <LiveStatus message="Alle Werte sind simuliert und wachsen mit der Simulationsuhr weiter." />
      </div>
    </section>
  );
}

export default HistoryChart;
