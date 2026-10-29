import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getHistory } from "../api/client";
import { HistoryChart } from "../components/history/HistoryChart";
import { ROOM_LABELS } from "../labels";
import { useSimState } from "../state/SimStateProvider";
import type { HistoryMetric, HistoryResponse, RoomId } from "../types";
import { Chips, type ChipOption, PageHead, Segmented, type SegmentOption } from "../ui";

/** Hours of simulation time the page shows (the API accepts 1..168). */
export const HISTORY_HOURS = 24;
/** The chart follows the running clock, but is fetched at most this often (real ms). */
export const HISTORY_REFRESH_MIN_MS = 5_000;

type RoomChoice = RoomId | "all";

/** The design's metric labels (design/mockups/verlauf.html:52-55). */
const METRIC_OPTIONS: SegmentOption<HistoryMetric>[] = [
  { value: "temperature", label: "Temperatur" },
  { value: "humidity", label: "Feuchte" },
  { value: "co2", label: "CO2" },
  { value: "power", label: "Verbrauch vs. Solar" },
];

const ROOM_ORDER: RoomId[] = ["wohnzimmer", "kueche", "schlafzimmer", "kinderzimmer", "bad", "flur"];

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.status === 0
      ? "Keine Verbindung zur Simulation – der Verlauf wird erneut geladen."
      : `Der Verlauf konnte nicht geladen werden: ${err.detail}`;
  }
  return "Der Verlauf konnte nicht geladen werden.";
}

/** "Verlauf" (design/mockups/verlauf.html): simulated values of the last hours. */
export function HistoryPage() {
  const { state } = useSimState();
  const [metric, setMetric] = useState<HistoryMetric>("temperature");
  const [room, setRoom] = useState<RoomChoice>("all");
  const hours = HISTORY_HOURS;
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the answer to the latest request is kept.
  const requestSeq = useRef(0);
  const lastFetchAt = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The room filter does not apply to power (whole house).
  const roomId: RoomId | undefined = metric === "power" || room === "all" ? undefined : room;

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    lastFetchAt.current = Date.now();
    setLoading(true);
    try {
      const res = await getHistory(metric, roomId, hours);
      if (mounted.current && seq === requestSeq.current) {
        setData(res);
        setError(null);
      }
    } catch (err) {
      if (mounted.current && seq === requestSeq.current) setError(errorMessage(err));
    } finally {
      if (mounted.current && seq === requestSeq.current) setLoading(false);
    }
  }, [metric, roomId, hours]);

  // On mount and on every filter change; the old filter's curves are not shown meanwhile.
  useEffect(() => {
    setData(null);
    setError(null);
    void load();
  }, [load]);

  // Follow the simulation clock, throttled to one request per HISTORY_REFRESH_MIN_MS.
  const simTime = state?.clock.sim_time;
  const lastSimTime = useRef(simTime);
  useEffect(() => {
    if (simTime === undefined || simTime === lastSimTime.current) return;
    lastSimTime.current = simTime;
    if (Date.now() - lastFetchAt.current < HISTORY_REFRESH_MIN_MS) return;
    void load();
  }, [simTime, load]);

  const roomOptions: ChipOption<RoomChoice>[] = [
    { value: "all", label: "Alle Räume" },
    ...ROOM_ORDER.map((id) => ({
      value: id,
      label: state?.rooms.find((r) => r.id === id)?.name ?? ROOM_LABELS[id],
    })),
  ];
  const roomName = roomId ? (roomOptions.find((o) => o.value === roomId)?.label ?? null) : null;

  return (
    <main className="page" data-page="history">
      <div className="page-pad">
        <div data-od-id="history-head">
          <PageHead
            title="Wie das Haus den letzten Tag erlebt hat"
            intro={`Jede Kurve zeigt simulierte Werte der vergangenen ${hours} Stunden. Wähle eine Größe und einen Raum, die gelbe Linie markiert den Moment der Simulationsuhr.`}
          />
        </div>

        <section
          className="region stack"
          style={{ paddingTop: "var(--s-5)" }}
          data-od-id="history-filters"
          aria-label="Filter für den Verlauf"
        >
          <Segmented label="Größe" ink options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
          {metric !== "power" && <Chips label="Raum" options={roomOptions} value={room} onChange={setRoom} />}
        </section>

        <HistoryChart
          metric={metric}
          data={data}
          loading={loading}
          error={error}
          hours={hours}
          roomName={roomName}
          now={simTime}
          thresholds={state?.thresholds}
          solar={state?.solar}
        />
        <div style={{ height: "var(--s-6)" }} />
      </div>
    </main>
  );
}

export default HistoryPage;
