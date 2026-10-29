import { useEffect, useState } from "react";
import { ApiError, getHistory } from "../../api/client";
import type { HistoryResponse, RoomId } from "../../types";
import { EmptyState, TextLink, TimeChart } from "../../ui";

/** The chart is fetched again this often (real ms), so it follows the running simulation. */
export const ROOM_HISTORY_REFRESH_MS = 30_000;

export interface RoomHistoryProps {
  roomId: RoomId;
  roomName: string;
  /** Current simulation time: the chart's "Jetzt" line. */
  now?: string;
}

/**
 * The design's `room-history` (design/mockups/raum.html:189): the room's
 * temperature of the last 24 h against outdoor, drawn by the kit's TimeChart.
 */
export function RoomHistory({ roomId, roomName, now }: RoomHistoryProps) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const load = async () => {
      try {
        const res = await getHistory("temperature", roomId, 24);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.status === 0
              ? "Keine Verbindung zur Simulation – der Verlauf wird erneut geladen."
              : "Der Verlauf konnte nicht geladen werden.",
          );
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), ROOM_HISTORY_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomId]);

  // The room first (c1), outdoor dashed (c-out), as in the design's legend.
  const series = data
    ? [...data.series].sort((a, b) => (a.key === "aussen" ? 1 : 0) - (b.key === "aussen" ? 1 : 0))
    : [];

  return (
    <section className="region" style={{ paddingTop: "var(--s-4)" }} data-od-id="room-history" aria-labelledby="room-history-title">
      <div className="row row--between" style={{ marginBottom: "var(--s-3)" }}>
        <h2 id="room-history-title" style={{ fontSize: "var(--fs-lead)" }}>
          Temperatur letzte 24 h vs. Außen
        </h2>
        <TextLink to="/verlauf">Alle Verläufe</TextLink>
      </div>
      {error && !data ? (
        <EmptyState icon="circle-alert" title="Verlauf nicht verfügbar" text={error} />
      ) : !data ? (
        <p className="small muted" role="status">
          Verlauf wird geladen …
        </p>
      ) : (
        <TimeChart
          mini
          series={series}
          unit="°"
          decimals={1}
          from={data.from_time}
          to={data.to_time}
          now={now}
          ariaLabel={`Verlauf der Temperatur ${roomName} gegenüber der Außentemperatur, letzte 24 Stunden, simuliert`}
        />
      )}
    </section>
  );
}

export default RoomHistory;
