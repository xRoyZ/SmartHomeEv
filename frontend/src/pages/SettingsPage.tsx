import { useState } from "react";
import { resetSimulation } from "../api/client";
import { EventTriggers } from "../components/settings/EventTriggers";
import {
  settingsErrorText,
  SimulationSettingsForm,
  type StatusTone,
} from "../components/settings/SimulationSettingsForm";
import { useSimState } from "../state/SimStateProvider";
import { Button, EmptyState, Grid, LiveStatus, PageHead, Row } from "../ui";

interface Status {
  message: string;
  tone: StatusTone;
}

/** "Simulation" (design/mockups/simulation.html): conditions, events and reset. */
export function SettingsPage() {
  const { state } = useSimState();
  const [status, setStatus] = useState<Status | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<Status | null>(null);

  const report = (message: string, tone: StatusTone): void => setStatus({ message, tone });

  async function doReset(): Promise<void> {
    setResetting(true);
    try {
      const next = await resetSimulation();
      const start = next.settings.start_time.slice(11, 16);
      setStatus(null);
      setResetResult({
        message: `Simulation auf Ausgangszustand zurückgesetzt – Startzeit ${start}, Seed ${next.settings.seed}.`,
        tone: "ok",
      });
    } catch (err) {
      setResetResult({ message: `Zurücksetzen fehlgeschlagen: ${settingsErrorText(err)}`, tone: "error" });
    } finally {
      setResetting(false);
      setConfirming(false);
    }
  }

  const settings = state?.settings ?? null;

  return (
    <main className="page" data-page="settings">
      <div className="page-pad">
        <div data-od-id="simulation-head">
          <PageHead
            title="Bring das Haus kontrolliert aus dem Takt"
            intro="Stell Wetter, Jahreszeit und Bewohner ein und löse ein Ereignis aus. Jedes Ereignis verändert Messwerte und erzeugt einen Alarm in der Übersicht."
          />
        </div>

        {state === null || settings === null ? (
          <div className="region" style={{ paddingTop: "var(--s-5)" }}>
            <EmptyState
              icon="radio"
              title="Simulation wird geladen …"
              text="Sobald die Verbindung steht, erscheinen hier Bedingungen, Ereignisse und das Zurücksetzen."
            />
          </div>
        ) : (
          <>
            <Grid split style={{ paddingTop: "var(--s-5)" }}>
              <SimulationSettingsForm settings={settings} onStatus={report} />
              <EventTriggers activeEvents={state.active_events} status={status} onStatus={report} />
            </Grid>

            <section
              className="region"
              style={{ paddingTop: "var(--s-6)" }}
              data-od-id="reset-zone"
              aria-labelledby="reset-title"
            >
              <div className="reset-zone">
                <div className="stack-sm">
                  <h2 id="reset-title" style={{ fontSize: "var(--fs-lead)" }}>
                    Zurück zum Anfang
                  </h2>
                  <p>
                    Uhr, Gerätezustände, Alarme, Verlauf und die drei Standard-Automationen kehren in den
                    Ausgangszustand zurück. Seed {settings.seed} und Startzeit {settings.start_time.slice(11, 16)}{" "}
                    bleiben.
                  </p>
                </div>
                {confirming ? (
                  <div className="stack-sm" role="group" aria-label="Zurücksetzen bestätigen">
                    <p>
                      <strong>Wirklich zurücksetzen?</strong> Der aktuelle Ablauf geht verloren.
                    </p>
                    <Row>
                      <Button danger icon="rotate-ccw" disabled={resetting} onClick={() => void doReset()}>
                        {resetting ? "Wird zurückgesetzt …" : "Ja, zurücksetzen"}
                      </Button>
                      <Button disabled={resetting} onClick={() => setConfirming(false)}>
                        Abbrechen
                      </Button>
                    </Row>
                  </div>
                ) : (
                  <Button
                    danger
                    icon="rotate-ccw"
                    data-od-id="reset-simulation"
                    onClick={() => {
                      setResetResult(null);
                      setConfirming(true);
                    }}
                  >
                    Auf Ausgangszustand zurücksetzen
                  </Button>
                )}
              </div>
              {resetResult && (
                <LiveStatus
                  icon={resetResult.tone === "error" ? "circle-alert" : "circle-check"}
                  message={resetResult.message}
                />
              )}
            </section>
          </>
        )}
        <div style={{ height: "var(--s-6)" }} />
      </div>
    </main>
  );
}

export default SettingsPage;
