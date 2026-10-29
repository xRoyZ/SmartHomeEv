import { useCallback, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DevicesControl,
  HeatingControl,
  LightControl,
  ShutterControl,
  WindowControl,
} from "../components/room/DeviceControl";
import { RoomHistory } from "../components/room/RoomHistory";
import { SensorPanel } from "../components/room/SensorPanel";
import { useSimState } from "../state/SimStateProvider";
import type {
  ApplianceDevice,
  Device,
  LightDevice,
  PlugDevice,
  ShutterDevice,
  ThermostatDevice,
  WindowDevice,
} from "../types";
import { EmptyState, Icon, LiveStatus, LiveValue, TextLink } from "../ui";

const DEFAULT_STATUS = "Änderungen wirken sofort und sind auf allen verbundenen Geräten sichtbar.";

function byKind<K extends Device["kind"]>(devices: Device[], kind: K): Extract<Device, { kind: K }>[] {
  return devices.filter((d): d is Extract<Device, { kind: K }> => d.kind === kind);
}

/** The room detail screen (design/mockups/raum.html) for /raum/:roomId. */
export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { state } = useSimState();
  const [status, setStatus] = useState<{ text: string; n: number }>({ text: DEFAULT_STATUS, n: 0 });
  const report = useCallback((text: string) => setStatus((s) => ({ text, n: s.n + 1 })), []);

  if (state === null) {
    return (
      <main className="page" data-page="room">
        <div className="page-pad" style={{ paddingBlock: "var(--s-6)" }}>
          <h1 className="sr-only">Raum</h1>
          <p className="small muted" role="status">
            Raumdaten werden geladen …
          </p>
        </div>
      </main>
    );
  }

  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) {
    return (
      <main className="page" data-page="room">
        <div className="page-pad" style={{ paddingBlock: "var(--s-6)" }}>
          <h1 className="page-title">Raum nicht gefunden</h1>
          <EmptyState
            icon="circle-alert"
            title="Diesen Raum gibt es im simulierten Haus nicht."
            text="Wähle einen Raum aus der Übersicht."
          >
            <TextLink to="/" icon="arrow-left">
              Zur Übersicht
            </TextLink>
          </EmptyState>
        </div>
      </main>
    );
  }

  const devices = state.devices.filter((d) => d.room_id === room.id);
  const thermostat = byKind(devices, "thermostat")[0] as ThermostatDevice | undefined;
  const light = byKind(devices, "light")[0] as LightDevice | undefined;
  const shutter = byKind(devices, "shutter")[0] as ShutterDevice | undefined;
  const windowDevice = byKind(devices, "window")[0] as WindowDevice | undefined;
  const switchables = devices.filter((d): d is PlugDevice | ApplianceDevice => d.kind === "plug" || d.kind === "appliance");
  const powerW = devices.reduce((sum, d) => sum + d.power_w, 0);
  const lit = light && light.on ? light.brightness / 100 : 0;

  return (
    <main className="page" data-page="room">
      <section
        className="sheet"
        id="room-sheet"
        style={{ "--lit": lit } as CSSProperties}
        data-od-id="room-head"
        aria-labelledby="room-title"
      >
        <div className="page-pad" style={{ paddingBlock: "var(--s-3) var(--s-5)" }}>
          <Link className="crumb" to="/">
            <Icon name="arrow-left" />
            Übersicht
          </Link>
          <div className="room-title" style={{ marginTop: "var(--s-2)" }}>
            <h1 id="room-title">{room.name}</h1>
            <p className="temp" data-od-id="room-temperature">
              <LiveValue value={room.temperature_c} decimals={1} />
              <small>°C</small>
            </p>
          </div>
          <SensorPanel room={room} windowOpen={windowDevice ? windowDevice.open : undefined} powerW={powerW} />
        </div>
      </section>

      <div className="page-pad">
        <div className="grid main-split region" style={{ paddingTop: "var(--s-6)" }}>
          <div className="span-7 stack">
            {thermostat && <HeatingControl device={thermostat} room={room} onStatus={report} />}
            {light && <LightControl device={light} room={room} onStatus={report} />}
          </div>
          <div className="span-5 stack">
            {shutter && <ShutterControl device={shutter} room={room} onStatus={report} />}
            {windowDevice && <WindowControl device={windowDevice} room={room} onStatus={report} />}
            {switchables.length > 0 && <DevicesControl devices={switchables} room={room} onStatus={report} />}
          </div>
        </div>

        <div className="region" style={{ paddingTop: "var(--s-3)" }}>
          <LiveStatus id="room-status" message={status.text} messageKey={status.n} />
        </div>

        <RoomHistory key={room.id} roomId={room.id} roomName={room.name} now={state.clock.sim_time} />
        <div style={{ height: "var(--s-6)" }} />
      </div>
    </main>
  );
}

export default RoomPage;
