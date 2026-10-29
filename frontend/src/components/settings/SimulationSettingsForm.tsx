import { useState, type FormEvent } from "react";
import { ApiError, updateSettings } from "../../api/client";
import { BEHAVIOUR_LABELS, SEASON_LABELS, WEATHER_MODE_LABELS } from "../../labels";
import type { Behaviour, Season, Settings, SettingsUpdate, WeatherMode } from "../../types";
import { Button, Chips, EditorLine, Field, fieldErrorId, Input, Stepper, type ChipOption } from "../../ui";

export const SEED_MAX = 2147483647;
export const ADULTS_MIN = 1;
export const ADULTS_MAX = 4;
export const CHILDREN_MIN = 0;
export const CHILDREN_MAX = 3;

export type StatusTone = "info" | "ok" | "error";
export type StatusReporter = (message: string, tone: StatusTone) => void;

function options<T extends string>(labels: Record<T, string>): ChipOption<T>[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

const WEATHER_OPTIONS = options<WeatherMode>(WEATHER_MODE_LABELS);
const SEASON_OPTIONS = options<Season>(SEASON_LABELS);
const BEHAVIOUR_OPTIONS = options<Behaviour>(BEHAVIOUR_LABELS);

/** German text for a failed settings or simulation request. */
export function settingsErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Keine Verbindung zur Simulation – bitte erneut versuchen.";
    if (err.status === 422) return `Wert nicht übernommen: ${err.detail}`;
    return `Anfrage fehlgeschlagen (${err.status}): ${err.detail}`;
  }
  return "Unerwarteter Fehler – bitte erneut versuchen.";
}

/** "2026-01-15T06:00:00" -> "2026-01-15T06:00" (the value of a datetime-local input). */
export function toLocalInput(iso: string): string {
  return iso.slice(0, 16);
}

/** "2026-01-15T06:00" -> "2026-01-15T06:00:00"; null when it is no valid date and time. */
export function fromLocalInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d) ||
    Number(h) > 23 ||
    Number(mi) > 59
  ) {
    return null;
  }
  return `${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}`;
}

interface Draft {
  start: string;
  seed: string;
  adults: number;
  children: number;
}

interface DraftErrors {
  start?: string;
  seed?: string;
}

function draftOf(settings: Settings): Draft {
  return {
    start: toLocalInput(settings.start_time),
    seed: String(settings.seed),
    adults: settings.adults,
    children: settings.children,
  };
}

/** Checks the draft; returns the update to send, or the German field errors. */
export function validateDraft(draft: Draft): { update: SettingsUpdate | null; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const start = fromLocalInput(draft.start);
  if (start === null) errors.start = "Bitte Datum und Uhrzeit wählen.";
  const seedText = draft.seed.trim();
  const seed = Number(seedText);
  if (!/^\d+$/.test(seedText) || !Number.isSafeInteger(seed) || seed > SEED_MAX) {
    errors.seed = `Bitte eine ganze Zahl von 0 bis ${SEED_MAX} eingeben.`;
  }
  if (errors.start || errors.seed || start === null) return { update: null, errors };
  return {
    update: { start_time: start, seed, adults: draft.adults, children: draft.children },
    errors,
  };
}

export interface SimulationSettingsFormProps {
  settings: Settings;
  onStatus: StatusReporter;
}

type ChoiceField = "weather_mode" | "season" | "behaviour";

/**
 * The "Bedingungen" panel (design/mockups/simulation.html:51): weather, season
 * and behaviour apply at once; start time, seed and household size are saved
 * here and take effect at the next reset.
 */
export function SimulationSettingsForm({ settings, onStatus }: SimulationSettingsFormProps) {
  // A choice sent but not yet confirmed by the server shows as chosen already.
  const [pendingChoice, setPendingChoice] = useState<Partial<Record<ChoiceField, string>>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [touched, setTouched] = useState<{ start?: boolean; seed?: boolean }>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const current = draft ?? draftOf(settings);
  const { errors } = validateDraft(current);
  const startError = touched.start || submitted ? errors.start : undefined;
  const seedError = touched.seed || submitted ? errors.seed : undefined;

  async function choose<F extends ChoiceField>(field: F, value: Settings[F], label: string): Promise<void> {
    setPendingChoice((p) => ({ ...p, [field]: value }));
    try {
      await updateSettings({ [field]: value } as SettingsUpdate);
      onStatus(`${label} übernommen.`, "ok");
    } catch (err) {
      onStatus(settingsErrorText(err), "error");
    } finally {
      setPendingChoice((p) => {
        const next = { ...p };
        delete next[field];
        return next;
      });
    }
  }

  function edit(patch: Partial<Draft>): void {
    setDraft({ ...current, ...patch });
  }

  async function save(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitted(true);
    const { update } = validateDraft(current);
    if (!update) return;
    setSaving(true);
    try {
      await updateSettings(update);
      setDraft(null);
      setTouched({});
      setSubmitted(false);
      onStatus(
        `Einstellungen gespeichert – Seed ${update.seed}, ${update.adults} Erwachsene, ${update.children} Kinder. Sie gelten ab dem nächsten Zurücksetzen.`,
        "ok",
      );
    } catch (err) {
      onStatus(settingsErrorText(err), "error");
    } finally {
      setSaving(false);
    }
  }

  const weather = (pendingChoice.weather_mode as WeatherMode | undefined) ?? settings.weather_mode;
  const season = (pendingChoice.season as Season | undefined) ?? settings.season;
  const behaviour = (pendingChoice.behaviour as Behaviour | undefined) ?? settings.behaviour;

  return (
    <section className="span-5 stack" data-od-id="conditions" aria-labelledby="cond-title">
      <form className="panel" style={{ display: "grid", gap: "var(--s-2)" }} onSubmit={save} noValidate>
        <h2 id="cond-title" className="panel__title">
          Bedingungen
        </h2>

        <div className="cond" style={{ marginTop: "var(--s-1)" }}>
          <Chips
            label="Wetter"
            options={WEATHER_OPTIONS}
            value={weather}
            onChange={(v) => void choose("weather_mode", v, `Wetter ${WEATHER_MODE_LABELS[v]}`)}
          />
        </div>

        <div className="cond">
          <Chips
            label="Jahreszeit"
            options={SEASON_OPTIONS}
            value={season}
            onChange={(v) => void choose("season", v, `Jahreszeit ${SEASON_LABELS[v]}`)}
          />
        </div>

        <div className="cond">
          <Chips
            label="Bewohner"
            options={BEHAVIOUR_OPTIONS}
            value={behaviour}
            onChange={(v) => void choose("behaviour", v, `Bewohner ${BEHAVIOUR_LABELS[v]}`)}
          />
        </div>

        <div className="cond">
          <EditorLine cols={2}>
            <Field label="Startzeit" htmlFor="start-time" error={startError}>
              <Input
                id="start-time"
                type="datetime-local"
                value={current.start}
                invalid={Boolean(startError)}
                onChange={(e) => {
                  setTouched((t) => ({ ...t, start: true }));
                  edit({ start: e.target.value });
                }}
              />
            </Field>
            <Field label="Seed" htmlFor="seed" error={seedError}>
              <Input
                id="seed"
                type="number"
                inputMode="numeric"
                min={0}
                max={SEED_MAX}
                step={1}
                value={current.seed}
                invalid={Boolean(seedError)}
                aria-describedby={seedError ? fieldErrorId("seed") : "seed-hint"}
                onChange={(e) => {
                  setTouched((t) => ({ ...t, seed: true }));
                  edit({ seed: e.target.value });
                }}
              />
            </Field>
          </EditorLine>
          <EditorLine cols={2}>
            <div className="field">
              <span className="label">Erwachsene</span>
              <Stepper
                label="Erwachsene"
                value={current.adults}
                min={ADULTS_MIN}
                max={ADULTS_MAX}
                step={1}
                onChange={(adults) => edit({ adults })}
              />
            </div>
            <div className="field">
              <span className="label">Kinder</span>
              <Stepper
                label="Kinder"
                value={current.children}
                min={CHILDREN_MIN}
                max={CHILDREN_MAX}
                step={1}
                onChange={(children) => edit({ children })}
              />
            </div>
          </EditorLine>
          <p className="seed-hint" id="seed-hint">
            Gleicher Seed, gleiche Einstellungen und gleiche Eingaben ergeben genau denselben Ablauf. Startzeit, Seed
            und Bewohnerzahl gelten ab dem nächsten Zurücksetzen.
          </p>
        </div>

        <div className="row" style={{ marginTop: "var(--s-2)" }}>
          <Button type="submit" variant="primary" icon="check" disabled={saving} data-od-id="apply-conditions">
            {saving ? "Wird gespeichert …" : "Einstellungen übernehmen"}
          </Button>
        </div>
      </form>
    </section>
  );
}

export default SimulationSettingsForm;
