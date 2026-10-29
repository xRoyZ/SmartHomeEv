import { AlertList } from "../components/alerts/AlertList";
import { ThresholdForm } from "../components/alerts/ThresholdForm";
import { useSimState } from "../state/SimStateProvider";
import { EmptyState, Grid, PageHead } from "../ui";

/** "Alarme" (design/mockups/alarme.html): open and acknowledged alerts, thresholds. */
export function AlertsPage() {
  const { state } = useSimState();

  return (
    <main className="page" data-page="alerts">
      <div className="page-pad">
        <div data-od-id="alerts-head">
          <PageHead
            title="Was das Haus meldet, bevor jemand fragt"
            intro="Ein Alarm bleibt sichtbar, bis ihn jemand bestätigt. Die Bestätigung gilt auf allen verbundenen Geräten sofort."
          />
        </div>

        {state === null ? (
          <div className="region" style={{ paddingTop: "var(--s-5)" }}>
            <EmptyState
              icon="wifi-off"
              title="Verbinde mit der Simulation …"
              text="Alarme und Grenzwerte erscheinen, sobald der Simulationszustand da ist."
            />
          </div>
        ) : (
          <Grid split style={{ paddingTop: "var(--s-5)" }}>
            <div className="span-7 stack" style={{ gap: "var(--s-6)" }}>
              <AlertList alerts={state.alerts} rooms={state.rooms} now={state.clock.sim_time} />
            </div>
            <ThresholdForm thresholds={state.thresholds} rooms={state.rooms} consumptionW={state.solar.consumption_w} />
          </Grid>
        )}
        <div style={{ height: "var(--s-6)" }} />
      </div>
    </main>
  );
}

export default AlertsPage;
