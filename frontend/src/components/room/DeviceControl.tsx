import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ApiError, updateDevice } from "../../api/client";
import type {
  ApplianceDevice,
  Device,
  DeviceUpdate,
  LightDevice,
  PlugDevice,
  Room,
  ShutterDevice,
  ThermostatDevice,
  WindowDevice,
} from "../../types";
import { Button, formatNumber, Icon, Select, Stepper, Switch, cx, type IconName } from "../../ui";

/** Reports a short German line to the page's live status (design/mockups/raum.html:179). */
export type StatusReporter = (message: string) => void;

/** How long a brightness / shutter drag rests before it is sent. */
export const RANGE_SEND_DELAY_MS = 200;

/** The German text shown when a device operation fails. */
export function deviceErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Keine Verbindung zur Simulation – bitte erneut versuchen.";
    if (err.status === 404) return "Dieses Gerät gibt es in der Simulation nicht mehr.";
    if (err.status === 422) return `Wert nicht übernommen: ${err.detail}`;
    return `Änderung fehlgeschlagen: ${err.detail}`;
  }
  return "Änderung fehlgeschlagen – bitte erneut versuchen.";
}

export interface DeviceCommand {
  /** A request is on its way. */
  pending: boolean;
  /** The German error of the last failed request, null after a success. */
  error: string | null;
  /** The update of the request in flight; shown until the live state takes over. */
  draft: DeviceUpdate | null;
  send: (update: DeviceUpdate, status?: string) => Promise<void>;
}

/**
 * Sends DeviceUpdates for one device with pending / error feedback. Only the
 * latest request settles the feedback; the live state (WebSocket) stays the
 * source of truth for what the device actually is.
 */
export function useDeviceCommand(deviceId: string, onStatus?: StatusReporter): DeviceCommand {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DeviceUpdate | null>(null);
  const seq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = useCallback(
    async (update: DeviceUpdate, status?: string) => {
      const n = ++seq.current;
      setPending(true);
      setError(null);
      setDraft(update);
      try {
        await updateDevice(deviceId, update);
        if (mounted.current && n === seq.current && status) onStatus?.(status);
      } catch (err) {
        if (mounted.current && n === seq.current) setError(deviceErrorText(err));
      } finally {
        if (mounted.current && n === seq.current) {
          setPending(false);
          setDraft(null);
        }
      }
    },
    [deviceId, onStatus],
  );

  return { pending, error, draft, send };
}

/** Pending / error line under a control. */
export function ControlFeedback({ pending, error }: { pending: boolean; error: string | null }) {
  if (error) {
    return (
      <p className="field-error" role="alert">
        <Icon name="circle-alert" />
        <span>{error}</span>
      </p>
    );
  }
  if (pending) {
    return (
      <p className="small muted" role="status">
        Wird übernommen …
      </p>
    );
  }
  return null;
}

/** A range value that is sent once the drag rests, shown locally meanwhile. */
function useRangeDraft(send: (value: number) => void) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const change = useCallback((value: number) => {
    setDragValue(value);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setDragValue(null);
      sendRef.current(value);
    }, RANGE_SEND_DELAY_MS);
  }, []);

  return { dragValue, change };
}

const rangeStyle = (value: number) => ({ "--val": `${value}%` }) as CSSProperties;

interface ControlProps<D extends Device> {
  device: D;
  room: Room;
  onStatus?: StatusReporter;
}

/* ---------- control-heizung ---------- */

/** The heating panel: target 5..30 °C in 0.5 steps (design/mockups/raum.html:65). */
export function HeatingControl({ device, room, onStatus }: ControlProps<ThermostatDevice>) {
  const cmd = useDeviceCommand(device.id, onStatus);
  const target = cmd.draft?.target_c ?? device.target_c;
  const state = device.failed ? "ausgefallen" : device.heating ? "heizt" : "aus";
  let hint: string;
  if (device.failed) {
    hint = "Die Heizung ist ausgefallen – das Zimmer kühlt aus, bis sie wieder läuft.";
  } else if (room.temperature_c < target - 0.2) {
    hint = `${room.name} wärmt sich auf ${formatNumber(target, 1)}° auf.`;
  } else {
    hint = `${room.name} hat das Ziel erreicht – die Heizung hält ${formatNumber(target, 1)}°.`;
  }
  return (
    <section className="panel ctl" data-od-id="control-heizung" aria-busy={cmd.pending || undefined}>
      <div className="ctl__head">
        <h2 className="ctl__title">
          <Icon name="heater" />
          Heizung
        </h2>
        <span className={cx("small num", device.failed ? "field-error" : "muted")}>
          Ist {formatNumber(room.temperature_c, 1)}° · {state}
        </span>
      </div>
      <div className="row row--between">
        <div className="stack-sm">
          <span className="label">Ziel</span>
          <Stepper
            value={target}
            min={5}
            max={30}
            step={0.5}
            decimals={1}
            unit="°"
            label="Zieltemperatur"
            onChange={(next) => void cmd.send({ target_c: next }, `Heizung ${room.name}: Ziel ${formatNumber(next, 1)}°`)}
          />
        </div>
        <p className="small muted" style={{ maxWidth: "26ch" }}>
          {hint}
        </p>
      </div>
      <ControlFeedback pending={cmd.pending} error={cmd.error} />
    </section>
  );
}

/* ---------- control-licht ---------- */

/** The light panel: on/off toggle and brightness 0..100 (design/mockups/raum.html:97). */
export function LightControl({ device, room, onStatus }: ControlProps<LightDevice>) {
  const cmd = useDeviceCommand(device.id, onStatus);
  const on = cmd.draft?.on ?? device.on;
  const committed = cmd.draft?.brightness ?? device.brightness;
  const range = useRangeDraft((value) => {
    const update: DeviceUpdate = value === 0 ? { on: false, brightness: 0 } : { brightness: value };
    if (value > 0 && !on) update.on = true;
    void cmd.send(update, `Licht ${room.name}: ${value === 0 ? "aus" : `${value} %`}`);
  });
  const brightness = range.dragValue ?? committed;

  const toggle = () => {
    if (on) {
      void cmd.send({ on: false }, `Licht ${room.name} ausgeschaltet`);
    } else {
      const update: DeviceUpdate = { on: true };
      if (committed === 0) update.brightness = 100;
      void cmd.send(update, `Licht ${room.name} eingeschaltet`);
    }
  };

  return (
    <section className="panel ctl" data-od-id="control-licht" aria-busy={cmd.pending || undefined}>
      <div className="ctl__head">
        <h2 className="ctl__title">
          <Icon name={on ? "lightbulb" : "lightbulb-off"} />
          Licht
        </h2>
        <Button
          variant="primary"
          pressed={on}
          whenOn="Licht ausschalten"
          whenOff="Licht einschalten"
          onClick={toggle}
          data-od-id="light-switch"
        />
      </div>
      <div className="row row--between">
        <span className="label">Helligkeit</span>
        <output className="figure num">
          <span key={`${on}-${brightness}`} className="tick">
            {on || range.dragValue !== null ? brightness : 0}
          </span>
          <small>%</small>
        </output>
      </div>
      <input
        className="range range--light"
        type="range"
        min={0}
        max={100}
        step={5}
        value={brightness}
        style={rangeStyle(brightness)}
        aria-label="Helligkeit in Prozent"
        onChange={(e) => range.change(Number(e.target.value))}
      />
      <div className="range-scale" aria-hidden="true">
        <span>0 %</span>
        <span>50 %</span>
        <span>100 %</span>
      </div>
      <ControlFeedback pending={cmd.pending} error={cmd.error} />
    </section>
  );
}

/* ---------- control-rollladen ---------- */

/**
 * The shutter panel (design/mockups/raum.html:117). The design's scale reads
 * "0 % zu … 100 % offen", the contract's position is 100 = fully closed, so the
 * panel shows and sets the opening: open = 100 - position.
 */
export function ShutterControl({ device, room, onStatus }: ControlProps<ShutterDevice>) {
  const cmd = useDeviceCommand(device.id, onStatus);
  const committedOpen = 100 - (cmd.draft?.position ?? device.position);
  const range = useRangeDraft((open) => {
    void cmd.send({ position: 100 - open }, `Rollladen ${room.name}: ${open} % offen`);
  });
  const open = range.dragValue ?? committedOpen;
  return (
    <section className="panel ctl" data-od-id="control-rollladen" aria-busy={cmd.pending || undefined}>
      <div className="ctl__head">
        <h2 className="ctl__title">
          <Icon name="blinds" />
          Rollladen
        </h2>
        <output className="figure num" style={{ fontSize: "22px" }}>
          <span key={open} className="tick">
            {open}
          </span>
          <small>%</small>
        </output>
      </div>
      <input
        className="range"
        type="range"
        min={0}
        max={100}
        step={5}
        value={open}
        style={rangeStyle(open)}
        aria-label="Rollladen geöffnet in Prozent"
        onChange={(e) => range.change(Number(e.target.value))}
      />
      <div className="range-scale" aria-hidden="true">
        <span>0 % zu</span>
        <span>100 % offen</span>
      </div>
      <ControlFeedback pending={cmd.pending} error={cmd.error} />
    </section>
  );
}

/* ---------- control-fenster ---------- */

/** The window panel: open / close (design/mockups/raum.html:132). */
export function WindowControl({ device, room, onStatus }: ControlProps<WindowDevice>) {
  const cmd = useDeviceCommand(device.id, onStatus);
  const open = cmd.draft?.open ?? device.open;
  return (
    <section className="panel ctl" data-od-id="control-fenster" aria-busy={cmd.pending || undefined}>
      <div className="ctl__head">
        <h2 className="ctl__title">
          <Icon name={open ? "door-open" : "door-closed"} />
          Fenster
        </h2>
        <Button
          pressed={open}
          whenOn="Fenster schließen"
          whenOff="Fenster öffnen"
          data-od-id="window-toggle"
          onClick={() =>
            void cmd.send(
              { open: !open },
              open ? `Fenster ${room.name} geschlossen` : `Fenster ${room.name} geöffnet – das Zimmer kühlt aus`,
            )
          }
        />
      </div>
      <p className="small muted">
        Aktuell {open ? "offen" : "zu"}. Ein offenes Fenster kühlt das Zimmer in Simulationszeit Richtung
        Außentemperatur.
      </p>
      <ControlFeedback pending={cmd.pending} error={cmd.error} />
    </section>
  );
}

/* ---------- control-geraete ---------- */

const DEVICE_ICONS: Record<string, IconName> = {
  tv: "tv",
  stehlampe: "lamp-floor",
  waschmaschine: "droplets",
  geschirrspueler: "droplets",
  kuehlschrank: "thermometer-snowflake",
  backofen: "flame",
  kaffeemaschine: "zap",
};

function deviceIcon(device: PlugDevice | ApplianceDevice): IconName {
  const slug = device.id.split(".").pop() ?? "";
  return DEVICE_ICONS[slug] ?? "plug";
}

const NO_PROGRAM = "";

/** One plug or appliance row: switch and, for an appliance, its program. */
export function SwitchableDevice({
  device,
  room,
  onStatus,
}: ControlProps<PlugDevice | ApplianceDevice>) {
  const cmd = useDeviceCommand(device.id, onStatus);
  const on = cmd.draft?.on ?? device.on;
  const appliance = device.kind === "appliance" ? device : null;
  const program = appliance ? (cmd.draft && "program" in cmd.draft ? cmd.draft.program : appliance.program) : null;
  const kindText = appliance ? (program ? `Programm ${program}` : "Gerät") : "Steckdose";
  const selectId = `program-${device.id.replace(".", "-")}`;

  return (
    <div className={cx("device", on && "is-on")} data-od-id={`device-${device.id}`} aria-busy={cmd.pending || undefined}>
      <span className="device__icon">
        <Icon name={deviceIcon(device)} />
      </span>
      <div className="device__body">
        <span className="device__name">{device.name}</span>
        <span className="device__state">
          {on ? "an" : "aus"} · {kindText}
          {on && device.power_w > 0 && <span className="num"> · {formatNumber(device.power_w)} W</span>}
        </span>
        {appliance && appliance.programs.length > 0 && (
          <div className="stack-sm" style={{ marginTop: "var(--s-2)" }}>
            <label className="sr-only" htmlFor={selectId}>
              Programm {device.name}
            </label>
            <Select
              id={selectId}
              value={program ?? NO_PROGRAM}
              options={[
                { value: NO_PROGRAM, label: "Kein Programm" },
                ...appliance.programs.map((p) => ({ value: p, label: p })),
              ]}
              onChange={(value) => {
                const next = value === NO_PROGRAM ? null : value;
                void cmd.send(
                  { program: next },
                  `${device.name} ${room.name}: ${next ? `Programm ${next}` : "kein Programm"}`,
                );
              }}
            />
          </div>
        )}
        <ControlFeedback pending={cmd.pending} error={cmd.error} />
      </div>
      <Switch
        checked={on}
        label={device.name}
        onChange={(next) =>
          void cmd.send({ on: next }, `${device.name} ${room.name} ${next ? "eingeschaltet" : "ausgeschaltet"}`)
        }
      />
    </div>
  );
}

/** The devices panel: plugs and appliances (design/mockups/raum.html:145). */
export function DevicesControl({
  devices,
  room,
  onStatus,
}: {
  devices: (PlugDevice | ApplianceDevice)[];
  room: Room;
  onStatus?: StatusReporter;
}) {
  return (
    <section className="panel ctl" data-od-id="control-geraete">
      <div className="ctl__head">
        <h2 className="ctl__title">
          <Icon name="plug" />
          Geräte
        </h2>
      </div>
      <div>
        {devices.map((d) => (
          <SwitchableDevice key={d.id} device={d} room={room} onStatus={onStatus} />
        ))}
      </div>
    </section>
  );
}
