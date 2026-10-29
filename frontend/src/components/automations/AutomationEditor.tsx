import { useState } from "react";
import { createAutomation, updateAutomation } from "../../api/client";
import { SENSOR_METRIC_LABELS, SUN_STATE_LABELS } from "../../labels";
import type {
  Automation,
  AutomationIn,
  Condition,
  Device,
  DeviceUpdate,
  Room,
  RoomId,
  SensorMetric,
} from "../../types";
import {
  Button,
  EditorLine,
  Field,
  Input,
  InputUnit,
  LiveStatus,
  Select,
  type SelectOption,
} from "../../ui";
import {
  automationErrorMessage,
  describeAction,
  describeCondition,
  deviceLabel,
  METRIC_UNITS,
  roomName,
} from "./AutomationList";

export const NAME_MAX = 80;

type ConditionType = Condition["type"];

const CONDITION_TYPE_OPTIONS: SelectOption<ConditionType>[] = [
  { value: "sensor", label: "Sensorwert" },
  { value: "contact", label: "Fensterkontakt" },
  { value: "motion", label: "Bewegung" },
  { value: "time", label: "Uhrzeit" },
  { value: "sun", label: "Sonne" },
];

const METRICS: SensorMetric[] = ["temperature_c", "humidity_pct", "co2_ppm"];
const OUTDOOR = "aussen";

/** The editor's form values; every id comes from a choice, never typed. */
export interface Draft {
  name: string;
  enabled: boolean;
  condType: ConditionType;
  /** "<room_id>:<metric>" or "aussen:temperature_c". */
  sensor: string;
  op: "<" | ">";
  value: string;
  windowId: string;
  windowOpen: "true" | "false";
  motionRoom: RoomId;
  motionDetected: "true" | "false";
  minutes: string;
  at: string;
  sun: "up" | "down";
  deviceId: string;
  /** Key of an entry of actionOptions(device). */
  actionKey: string;
  actionValue: string;
}

interface ActionOption extends SelectOption {
  /** Fields set when no value is needed. */
  set?: DeviceUpdate;
  /** A numeric value the user enters. */
  valueField?: { label: string; unit: string; min: number; max: number; integer: boolean; build: (v: number) => DeviceUpdate };
}

/** The actions a device of each kind offers (the fields the backend accepts for it). */
export function actionOptions(device: Device | undefined): ActionOption[] {
  if (!device) return [];
  const onOff: ActionOption[] = [
    { value: "on", label: "Einschalten", set: { on: true } },
    { value: "off", label: "Ausschalten", set: { on: false } },
  ];
  switch (device.kind) {
    case "thermostat":
      return [
        {
          value: "target",
          label: "Zieltemperatur setzen",
          valueField: { label: "Zieltemperatur", unit: "°C", min: 5, max: 30, integer: false, build: (v) => ({ target_c: v }) },
        },
      ];
    case "light":
      return [
        ...onOff,
        {
          value: "brightness",
          label: "Einschalten mit Helligkeit",
          valueField: { label: "Helligkeit", unit: "%", min: 0, max: 100, integer: true, build: (v) => ({ on: true, brightness: v }) },
        },
      ];
    case "shutter":
      return [
        { value: "close", label: "Ganz schließen", set: { position: 100 } },
        { value: "open", label: "Ganz öffnen", set: { position: 0 } },
        {
          value: "position",
          label: "Auf Position fahren",
          valueField: { label: "Geschlossen", unit: "%", min: 0, max: 100, integer: true, build: (v) => ({ position: v }) },
        },
      ];
    case "window":
      return [
        { value: "open", label: "Öffnen", set: { open: true } },
        { value: "close", label: "Schließen", set: { open: false } },
      ];
    case "plug":
      return onOff;
    case "appliance":
      return [
        ...onOff,
        ...device.programs.map((p) => ({ value: `program:${p}`, label: `Programm ${p} starten`, set: { on: true, program: p } })),
      ];
  }
}

function defaultActionKey(device: Device | undefined): string {
  return actionOptions(device)[0]?.value ?? "";
}

function defaultActionValue(device: Device | undefined): string {
  if (device?.kind === "thermostat") return "21";
  if (device?.kind === "light") return "60";
  return "50";
}

const has = <T,>(v: T | null | undefined): v is T => v !== null && v !== undefined;

/** A fresh rule: the design's example "Temperatur Küche < 18 °C, dann Heizung Küche". */
export function newDraft(devices: Device[], rooms: Room[]): Draft {
  const device = devices.find((d) => d.id === "kueche.heizung") ?? devices[0];
  const firstRoom = rooms[0]?.id ?? "kueche";
  const sensorRoom = rooms.some((r) => r.id === "kueche") ? "kueche" : firstRoom;
  return {
    name: "",
    enabled: true,
    condType: "sensor",
    sensor: `${sensorRoom}:temperature_c`,
    op: "<",
    value: "18",
    windowId: devices.find((d) => d.kind === "window")?.id ?? "",
    windowOpen: "true",
    motionRoom: firstRoom,
    motionDetected: "false",
    minutes: "10",
    at: "07:00",
    sun: "down",
    deviceId: device?.id ?? "",
    actionKey: defaultActionKey(device),
    actionValue: defaultActionValue(device),
  };
}

/** The editor's values for an existing rule. */
export function draftFromAutomation(a: Automation, devices: Device[], rooms: Room[]): Draft {
  const draft: Draft = { ...newDraft(devices, rooms), name: a.name, enabled: a.enabled, condType: a.condition.type };
  const c = a.condition;
  if (c.type === "sensor") {
    draft.sensor = `${c.room_id ?? OUTDOOR}:${c.metric}`;
    draft.op = c.op;
    draft.value = String(c.value);
  } else if (c.type === "contact") {
    draft.windowId = c.device_id;
    draft.windowOpen = c.open ? "true" : "false";
  } else if (c.type === "motion") {
    draft.motionRoom = c.room_id;
    draft.motionDetected = c.detected ? "true" : "false";
    draft.minutes = String(c.minutes);
  } else if (c.type === "time") {
    draft.at = c.at;
  } else {
    draft.sun = c.state;
  }

  const device = devices.find((d) => d.id === a.action.device_id);
  draft.deviceId = a.action.device_id;
  const s = a.action.set;
  let key = defaultActionKey(device);
  let value = defaultActionValue(device);
  if (device) {
    switch (device.kind) {
      case "thermostat":
        key = "target";
        if (has(s.target_c)) value = String(s.target_c);
        break;
      case "light":
        if (has(s.brightness)) {
          key = "brightness";
          value = String(s.brightness);
        } else key = s.on === false ? "off" : "on";
        break;
      case "shutter":
        if (s.position === 100) key = "close";
        else if (s.position === 0) key = "open";
        else if (has(s.position)) {
          key = "position";
          value = String(s.position);
        }
        break;
      case "window":
        key = s.open === false ? "close" : "open";
        break;
      case "plug":
        key = s.on === false ? "off" : "on";
        break;
      case "appliance":
        if (has(s.program) && device.programs.includes(s.program)) key = `program:${s.program}`;
        else key = s.on === false ? "off" : "on";
        break;
    }
  }
  draft.actionKey = key;
  draft.actionValue = value;
  return draft;
}

export type DraftErrors = Partial<Record<"name" | "value" | "minutes" | "at" | "windowId" | "deviceId" | "actionValue", string>>;

function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Validates the draft and builds the AutomationIn of the contract (only the fields really set). */
export function buildAutomationIn(draft: Draft, devices: Device[]): { value: AutomationIn | null; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const name = draft.name.trim();
  if (name === "") errors.name = "Bitte einen Namen eingeben.";
  else if (name.length > NAME_MAX) errors.name = `Der Name darf höchstens ${NAME_MAX} Zeichen lang sein.`;

  let condition: Condition | null = null;
  switch (draft.condType) {
    case "sensor": {
      const [room, metric] = draft.sensor.split(":") as [string, SensorMetric];
      const v = parseNumber(draft.value);
      if (v === null) errors.value = "Bitte einen Zahlenwert eingeben.";
      else condition = { type: "sensor", room_id: room === OUTDOOR ? null : (room as RoomId), metric, op: draft.op, value: v };
      break;
    }
    case "contact":
      if (!devices.some((d) => d.id === draft.windowId && d.kind === "window")) errors.windowId = "Bitte ein Fenster wählen.";
      else condition = { type: "contact", device_id: draft.windowId, open: draft.windowOpen === "true" };
      break;
    case "motion": {
      const m = parseNumber(draft.minutes);
      if (m === null || !Number.isInteger(m) || m < 1 || m > 240) errors.minutes = "Bitte 1 bis 240 ganze Minuten eingeben.";
      else condition = { type: "motion", room_id: draft.motionRoom, detected: draft.motionDetected === "true", minutes: m };
      break;
    }
    case "time":
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.at)) errors.at = "Bitte eine Uhrzeit wählen.";
      else condition = { type: "time", at: draft.at };
      break;
    case "sun":
      condition = { type: "sun", state: draft.sun };
      break;
  }

  const device = devices.find((d) => d.id === draft.deviceId);
  let set: DeviceUpdate | null = null;
  if (!device) {
    errors.deviceId = "Bitte ein Gerät wählen.";
  } else {
    const option = actionOptions(device).find((o) => o.value === draft.actionKey);
    if (!option) errors.deviceId = "Bitte eine Aktion wählen.";
    else if (option.valueField) {
      const f = option.valueField;
      const v = parseNumber(draft.actionValue);
      if (v === null || v < f.min || v > f.max || (f.integer && !Number.isInteger(v))) {
        errors.actionValue = `Bitte ${f.integer ? "eine ganze Zahl " : "einen Wert "}von ${f.min} bis ${f.max} ${f.unit} eingeben.`;
      } else set = f.build(v);
    } else if (option.set) set = { ...option.set };
  }

  if (Object.keys(errors).length > 0 || condition === null || set === null || !device) return { value: null, errors };
  return {
    value: { name, enabled: draft.enabled, condition, action: { device_id: device.id, set } },
    errors,
  };
}

export interface AutomationEditorProps {
  /** The rule being edited; null = a new rule. */
  automation: Automation | null;
  devices: Device[];
  rooms: Room[];
  /** False until the first state arrived: the editor cannot offer devices yet. */
  ready: boolean;
  onSaved?: (saved: Automation, created: boolean) => void;
}

/** The design's `rule-editor` (design/mockups/automationen.html:125). */
export function AutomationEditor({ automation, devices, rooms, ready, onSaved }: AutomationEditorProps) {
  const [draft, setDraft] = useState<Draft>(() =>
    automation ? draftFromAutomation(automation, devices, rooms) : newDraft(devices, rooms),
  );
  const [touched, setTouched] = useState<Partial<Record<keyof DraftErrors, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // A new rule opened before the first state arrived gets its defaults as soon as devices exist.
  const [seeded, setSeeded] = useState(devices.length > 0);
  if (!seeded && devices.length > 0) {
    setSeeded(true);
    if (!automation) setDraft((d) => ({ ...newDraft(devices, rooms), name: d.name }));
  }

  const { value, errors } = buildAutomationIn(draft, devices);
  const shown = (field: keyof DraftErrors): string | undefined =>
    submitted || touched[field] ? errors[field] : undefined;

  const update = (patch: Partial<Draft>, field?: keyof DraftErrors) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (field) setTouched((t) => ({ ...t, [field]: true }));
    setStatus(null);
    setFailure(null);
  };

  const selectDevice = (id: string) => {
    const device = devices.find((d) => d.id === id);
    update({ deviceId: id, actionKey: defaultActionKey(device), actionValue: defaultActionValue(device) });
  };

  const save = async () => {
    setSubmitted(true);
    setFailure(null);
    if (!value) return;
    setSaving(true);
    try {
      const saved = automation ? await updateAutomation(automation.id, value) : await createAutomation(value);
      if (automation) {
        setStatus(`Änderungen an „${saved.name}“ gespeichert.`);
      } else {
        setDraft(newDraft(devices, rooms));
        setTouched({});
        setSubmitted(false);
        setStatus(`Regel „${saved.name}“ angelegt – sie gilt jetzt auf allen Geräten.`);
      }
      onSaved?.(saved, !automation);
    } catch (err) {
      setFailure(automationErrorMessage(err, "Die Regel konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  };

  // Choices offered by the editor, all from the live state.
  const sensorOptions: SelectOption[] = [
    ...rooms.flatMap((r) => METRICS.map((m) => ({ value: `${r.id}:${m}`, label: `${SENSOR_METRIC_LABELS[m]} ${r.name}` }))),
    { value: `${OUTDOOR}:temperature_c`, label: "Außentemperatur" },
  ];
  if (!sensorOptions.some((o) => o.value === draft.sensor)) {
    const [room, metric] = draft.sensor.split(":") as [RoomId, SensorMetric];
    sensorOptions.unshift({ value: draft.sensor, label: `${SENSOR_METRIC_LABELS[metric] ?? metric} ${roomName(rooms, room)}` });
  }
  const sensorMetric = (draft.sensor.split(":")[1] ?? "temperature_c") as SensorMetric;
  const windowOptions: SelectOption[] = devices
    .filter((d) => d.kind === "window")
    .map((d) => ({ value: d.id, label: deviceLabel(d, rooms) }));
  const roomOptions: SelectOption<RoomId>[] = rooms.map((r) => ({ value: r.id, label: r.name }));
  const deviceOptions: SelectOption[] = devices.map((d) => ({ value: d.id, label: deviceLabel(d, rooms) }));
  const device = devices.find((d) => d.id === draft.deviceId);
  const actions = actionOptions(device);
  const action = actions.find((o) => o.value === draft.actionKey);

  const liveText =
    failure ??
    status ??
    (!ready
      ? "Warte auf die Simulation – Geräte und Räume werden geladen."
      : automation
        ? `Regel „${automation.name}“ bearbeiten – Speichern übernimmt die Änderungen.`
        : "Neue Regel – Name und Bedingung eintragen.");

  return (
    <section className="span-4 stack" data-od-id="rule-editor" aria-labelledby="editor-title">
      <form
        className="panel stack"
        style={{ gap: "var(--s-3)" }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="editor-title" style={{ fontSize: "var(--fs-lead)" }}>
          Regel bearbeiten
        </h2>

        <Field label="Name" htmlFor="rule-name" error={shown("name")}>
          <Input
            id="rule-name"
            type="text"
            maxLength={NAME_MAX}
            placeholder="z. B. Küche vorheizen"
            autoComplete="off"
            value={draft.name}
            invalid={Boolean(shown("name"))}
            onChange={(e) => update({ name: e.target.value }, "name")}
          />
        </Field>

        <div className="stack-sm">
          <span className="kw">Wenn</span>
          <Field label="Bedingung" htmlFor="f-cond-type">
            <Select id="f-cond-type" options={CONDITION_TYPE_OPTIONS} value={draft.condType} onChange={(v) => update({ condType: v })} />
          </Field>

          {draft.condType === "sensor" && (
            <EditorLine>
              <Field label="Sensor" htmlFor="f-sensor">
                <Select id="f-sensor" options={sensorOptions} value={draft.sensor} onChange={(v) => update({ sensor: v })} />
              </Field>
              <Field label="Ist" htmlFor="f-op">
                <Select
                  id="f-op"
                  options={[
                    { value: "<", label: "<" },
                    { value: ">", label: ">" },
                  ]}
                  value={draft.op}
                  onChange={(v) => update({ op: v as "<" | ">" })}
                />
              </Field>
              <Field label="Wert" htmlFor="f-val" error={shown("value")}>
                <InputUnit>
                  <Input
                    id="f-val"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={draft.value}
                    invalid={Boolean(shown("value"))}
                    aria-describedby="f-unit"
                    onChange={(e) => update({ value: e.target.value }, "value")}
                  />
                  {/* The unit follows from the chosen sensor, so it is shown as text next to the
                      number: an 84 px unit dropdown left the number a sliver in the 1280 px column. */}
                  <span id="f-unit" className="small muted" title="Die Einheit ergibt sich aus dem Sensor">
                    {METRIC_UNITS[sensorMetric]}
                  </span>
                </InputUnit>
              </Field>
            </EditorLine>
          )}

          {draft.condType === "contact" && (
            <EditorLine cols={2}>
              <Field label="Fenster" htmlFor="f-window" error={shown("windowId")}>
                <Select id="f-window" options={windowOptions} value={draft.windowId} onChange={(v) => update({ windowId: v }, "windowId")} />
              </Field>
              <Field label="Zustand" htmlFor="f-window-state">
                <Select
                  id="f-window-state"
                  options={[
                    { value: "true", label: "offen" },
                    { value: "false", label: "geschlossen" },
                  ]}
                  value={draft.windowOpen}
                  onChange={(v) => update({ windowOpen: v as "true" | "false" })}
                />
              </Field>
            </EditorLine>
          )}

          {draft.condType === "motion" && (
            <EditorLine>
              <Field label="Raum" htmlFor="f-motion-room">
                <Select id="f-motion-room" options={roomOptions} value={draft.motionRoom} onChange={(v) => update({ motionRoom: v })} />
              </Field>
              <Field label="Bewegung" htmlFor="f-motion-detected">
                <Select
                  id="f-motion-detected"
                  options={[
                    { value: "false", label: "keine" },
                    { value: "true", label: "erkannt" },
                  ]}
                  value={draft.motionDetected}
                  onChange={(v) => update({ motionDetected: v as "true" | "false" })}
                />
              </Field>
              <Field label="Minuten" htmlFor="f-minutes" error={shown("minutes")}>
                <InputUnit>
                  <Input
                    id="f-minutes"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={240}
                    step={1}
                    value={draft.minutes}
                    invalid={Boolean(shown("minutes"))}
                    onChange={(e) => update({ minutes: e.target.value }, "minutes")}
                  />
                  <span className="small muted">min</span>
                </InputUnit>
              </Field>
            </EditorLine>
          )}

          {draft.condType === "time" && (
            <Field label="Uhrzeit (Simulationszeit)" htmlFor="f-time" error={shown("at")}>
              <Input
                id="f-time"
                type="time"
                step={60}
                value={draft.at}
                invalid={Boolean(shown("at"))}
                onChange={(e) => update({ at: e.target.value }, "at")}
              />
            </Field>
          )}

          {draft.condType === "sun" && (
            <Field label="Sonne" htmlFor="f-sun">
              <Select
                id="f-sun"
                options={[
                  { value: "down", label: SUN_STATE_LABELS.down },
                  { value: "up", label: SUN_STATE_LABELS.up },
                ]}
                value={draft.sun}
                onChange={(v) => update({ sun: v as "up" | "down" })}
              />
            </Field>
          )}

          <span className="kw" style={{ marginTop: "var(--s-2)" }}>
            dann
          </span>
          <EditorLine cols={2}>
            <Field label="Gerät" htmlFor="f-device" error={shown("deviceId")}>
              <Select id="f-device" options={deviceOptions} value={draft.deviceId} onChange={selectDevice} disabled={!ready} />
            </Field>
            <Field label="Aktion" htmlFor="f-action">
              <Select
                id="f-action"
                options={actions}
                value={draft.actionKey}
                onChange={(v) => update({ actionKey: v })}
                disabled={!ready}
              />
            </Field>
          </EditorLine>
          {action?.valueField && (
            <Field label={action.valueField.label} htmlFor="f-action-value" error={shown("actionValue")}>
              <InputUnit>
                <Input
                  id="f-action-value"
                  type="number"
                  inputMode="decimal"
                  min={action.valueField.min}
                  max={action.valueField.max}
                  step={action.valueField.integer ? 1 : 0.5}
                  value={draft.actionValue}
                  invalid={Boolean(shown("actionValue"))}
                  onChange={(e) => update({ actionValue: e.target.value }, "actionValue")}
                />
                <span className="small muted">{action.valueField.unit}</span>
              </InputUnit>
            </Field>
          )}
        </div>

        <p className="preview" data-preview aria-live="polite">
          {value ? (
            <>
              <span>Wenn </span>
              <b>{describeCondition(value.condition, devices, rooms)}</b>
              <span>, dann </span>
              <b>{describeAction(value.action, devices, rooms)}</b>
              <span>.</span>
            </>
          ) : (
            <span>Die Vorschau erscheint, sobald Name, Bedingung und Aktion vollständig sind.</span>
          )}
        </p>

        <LiveStatus id="rule-status" message={liveText} icon={failure ? "circle-alert" : "radio"} />

        <div className="row row--between">
          <Button
            type="submit"
            variant="primary"
            icon="check"
            data-rule-save
            data-od-id="rule-save"
            disabled={saving || !ready}
            disabledHint={!ready ? "Warte auf die Simulation …" : undefined}
          >
            {saving ? "Speichert …" : "Speichern"}
          </Button>
          <p className="small muted" style={{ maxWidth: "22ch" }}>
            Namen erscheinen immer als reiner Text.
          </p>
        </div>
      </form>
    </section>
  );
}

export default AutomationEditor;
