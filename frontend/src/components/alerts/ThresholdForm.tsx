import { useEffect, useRef, useState } from "react";
import { ApiError, putThresholds } from "../../api/client";
import type { Room, Thresholds } from "../../types";
import { Button, formatNumber, Icon, Stepper } from "../../ui";

/** The contract's Thresholds ranges and the design's step sizes (design/mockups/alarme.html:174-228). */
export const THRESHOLD_LIMITS = {
  room_min_c: { min: 5, max: 25, step: 1 },
  room_max_c: { min: 15, max: 35, step: 1 },
  co2_max_ppm: { min: 400, max: 5000, step: 50 },
  power_max_w: { min: 500, max: 20000, step: 250 },
} as const satisfies Record<keyof Thresholds, { min: number; max: number; step: number }>;

/** German reason why a pair of thresholds cannot be saved, or null when it can. */
export function thresholdProblem(t: Thresholds): string | null {
  if (t.room_min_c >= t.room_max_c) {
    return "Das Temperatur-Minimum muss unter dem Maximum liegen. Bitte Minimum senken oder Maximum erhöhen – so wird nichts gespeichert.";
  }
  return null;
}

/** German message for a failed save. */
export function thresholdErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Keine Verbindung zur Simulation – die Grenzwerte wurden nicht gespeichert.";
    if (err.status === 422) return "Die Simulation hat die Grenzwerte abgelehnt: Bitte die Werte prüfen.";
    return `Die Grenzwerte konnten nicht gespeichert werden (Fehler ${err.status}).`;
  }
  return "Die Grenzwerte konnten nicht gespeichert werden.";
}

const decimalsOf = (v: number) => (Number.isInteger(v) ? 0 : 1);
const sameThresholds = (a: Thresholds, b: Thresholds) =>
  a.room_min_c === b.room_min_c &&
  a.room_max_c === b.room_max_c &&
  a.co2_max_ppm === b.co2_max_ppm &&
  a.power_max_w === b.power_max_w;

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export interface ThresholdFormProps {
  /** The thresholds of the live state. */
  thresholds: Thresholds;
  rooms: Room[];
  /** Current consumption of the whole house in W. */
  consumptionW: number;
}

/**
 * The design's `thresholds` panel (design/mockups/alarme.html:162). Every
 * stepper change is saved at once ("Änderungen gelten sofort"); an invalid
 * min/max pair is not sent and explains itself instead.
 */
export function ThresholdForm({ thresholds, rooms, consumptionW }: ThresholdFormProps) {
  const [draft, setDraft] = useState<Thresholds>(thresholds);
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const seq = useRef(0);

  const problem = thresholdProblem(draft);
  const busy = status.kind === "saving";
  const holdDraft = problem !== null || busy || status.kind === "error";

  const holdRef = useRef(holdDraft);
  holdRef.current = holdDraft;

  // Follow the live state (another client, a reset) unless the user's own change is unsaved.
  useEffect(() => {
    if (!holdRef.current) setDraft((d) => (sameThresholds(d, thresholds) ? d : thresholds));
  }, [thresholds]);

  const save = async (next: Thresholds) => {
    const mine = ++seq.current;
    setStatus({ kind: "saving" });
    try {
      const stored = await putThresholds(next);
      if (mine === seq.current) {
        if (stored) setDraft(stored);
        setStatus({ kind: "saved" });
      }
    } catch (err) {
      if (mine === seq.current) setStatus({ kind: "error", message: thresholdErrorMessage(err) });
    }
  };

  const change = (field: keyof Thresholds, value: number) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    setTouched(true);
    if (thresholdProblem(next) === null) {
      void save(next);
    } else {
      // Not sent: invalidate any answer still on its way so it cannot report "gespeichert".
      seq.current++;
      setStatus({ kind: "idle" });
    }
  };

  const stepper = (field: keyof Thresholds, label: string, decLabel: string, incLabel: string, unit: string, wide = false) => {
    const lim = THRESHOLD_LIMITS[field];
    return (
      <Stepper
        value={draft[field]}
        min={lim.min}
        max={lim.max}
        step={lim.step}
        decimals={decimalsOf(draft[field])}
        unit={unit}
        label={label}
        decLabel={decLabel}
        incLabel={incLabel}
        valueMinWidth={wide ? "5.4ch" : undefined}
        onChange={(v) => change(field, v)}
      />
    );
  };

  const byTemp = [...rooms].sort((a, b) => a.temperature_c - b.temperature_c);
  const coolest = byTemp[0];
  const warmest = byTemp[byTemp.length - 1];
  const co2Top = [...rooms].sort((a, b) => b.co2_ppm - a.co2_ppm)[0];

  let feedback: { text: string; error: boolean } = { text: "Grenzwerte gelten für alle verbundenen Geräte.", error: false };
  if (touched && problem) feedback = { text: problem, error: true };
  else if (touched && status.kind === "saving") feedback = { text: "Wird gespeichert …", error: false };
  else if (touched && status.kind === "saved")
    feedback = { text: "Gespeichert – gilt ab dem nächsten Simulationsschritt auf allen Geräten.", error: false };
  else if (touched && status.kind === "error") feedback = { text: status.message, error: true };

  return (
    <section className="span-5 stack" data-od-id="thresholds" aria-labelledby="thr-title">
      <div className="panel" style={{ display: "grid", gap: "var(--s-2)" }}>
        <div className="panel__head" style={{ marginBottom: 0 }}>
          <h2 id="thr-title" className="panel__title">
            Grenzwerte
          </h2>
        </div>
        <p className="small muted">Was als Abweichung zählt, legst du hier fest. Änderungen gelten sofort.</p>

        <div className="thr" style={{ marginTop: "var(--s-2)" }}>
          <span className="label">Raumtemperatur</span>
          <div className="thr__pair">
            <div className="stack-sm">
              <span className="label label--ink">min</span>
              {stepper("room_min_c", "Untere Temperaturgrenze", "Minimum senken", "Minimum erhöhen", "°")}
            </div>
            <div className="stack-sm">
              <span className="label label--ink">max</span>
              {stepper("room_max_c", "Obere Temperaturgrenze", "Maximum senken", "Maximum erhöhen", "°")}
            </div>
          </div>
          {coolest && warmest && (
            <p className="thr__now">
              Kühlster Raum {coolest.name} {formatNumber(coolest.temperature_c, 1)}° · wärmster {warmest.name}{" "}
              {formatNumber(warmest.temperature_c, 1)}° (simuliert)
            </p>
          )}
        </div>

        <div className="thr">
          <span className="label">CO2-Grenze</span>
          {stepper("co2_max_ppm", "CO2-Grenze", "CO2-Grenze senken", "CO2-Grenze erhöhen", "ppm", true)}
          {co2Top && (
            <p className="thr__now">
              Höchster Wert: {co2Top.name} {formatNumber(co2Top.co2_ppm)} ppm (simuliert)
            </p>
          )}
        </div>

        <div className="thr">
          <span className="label">Leistungsgrenze</span>
          {stepper("power_max_w", "Leistungsgrenze", "Leistungsgrenze senken", "Leistungsgrenze erhöhen", "W", true)}
          <p className="thr__now">Aktuell {formatNumber(consumptionW)} W im ganzen Haus (simuliert)</p>
        </div>

        <p
          className={feedback.error ? "live field-error" : "live"}
          id="thr-status"
          role={feedback.error ? "alert" : "status"}
          data-thr-feedback={feedback.error ? "error" : touched ? status.kind : "idle"}
        >
          <Icon name={feedback.error ? "circle-alert" : status.kind === "saved" && touched ? "check" : "radio"} />
          <span className="live-text">{feedback.text}</span>
        </p>
        {touched && status.kind === "error" && !problem && (
          <div>
            <Button size="sm" icon="rotate-ccw" onClick={() => void save(draft)}>
              Erneut speichern
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

export default ThresholdForm;
