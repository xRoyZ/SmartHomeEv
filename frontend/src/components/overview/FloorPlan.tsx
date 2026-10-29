import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ALERT_KIND_LABELS } from "../../labels";
import type { Alert, Device, LightDevice, Room, RoomId, SimState, WindowDevice } from "../../types";
import { cx, formatNumber, Icon, LiveValue } from "../../ui";

/** The two storeys of the section cut (design/mockups/index.html:104-224). */
const UPPER: readonly RoomId[] = ["schlafzimmer", "kinderzimmer", "bad"];
const GROUND: readonly RoomId[] = ["wohnzimmer", "kueche", "flur"];

/** The warm/cold scale spans 16 °C (left) to 26 °C (right), as in the mockup's values. */
const SCALE_MIN_C = 16;
const SCALE_SPAN_C = 10;

/** Position 0..1 of a temperature on the warm/cold scale. */
export function tempScale(temperatureC: number): number {
  if (!Number.isFinite(temperatureC)) return 0.5;
  return Math.min(1, Math.max(0, (temperatureC - SCALE_MIN_C) / SCALE_SPAN_C));
}

/** Plain-language reading of the scale for a non-technical eye and screen readers. */
export function tempFeel(temperatureC: number): string {
  const t = tempScale(temperatureC);
  if (t < 0.25) return "kühl";
  if (t > 0.75) return "warm";
  return "angenehm";
}

function findDevice<K extends Device["kind"]>(devices: Device[], id: string, kind: K): Extract<Device, { kind: K }> | undefined {
  const d = devices.find((x) => x.id === id);
  return d && d.kind === kind ? (d as Extract<Device, { kind: K }>) : undefined;
}

interface RoomCardProps {
  room: Room;
  light?: LightDevice;
  windowDevice?: WindowDevice;
  alerts: Alert[];
}

function RoomCard({ room, light, windowDevice, alerts }: RoomCardProps) {
  const lit = light && light.on ? Math.max(0, Math.min(100, light.brightness)) / 100 : 0;
  const alarmed = alerts.length > 0;
  const style = { "--lit": lit } as CSSProperties;
  return (
    <Link
      className={cx("room", alarmed && "is-alarm")}
      to={`/raum/${room.id}`}
      style={style}
      data-od-id={`room-${room.id}`}
      data-room={room.id}
      data-alarm={alarmed ? "true" : "false"}
    >
      <div>
        <p className="room__name">{room.name}</p>
        <p className="room__temp">
          <LiveValue value={room.temperature_c} decimals={1} />°
        </p>
        <span
          className="temp-scale"
          style={{ "--t": tempScale(room.temperature_c).toFixed(2) } as CSSProperties}
          title={`Temperatur ${tempFeel(room.temperature_c)}`}
        />
        <span className="sr-only">, {tempFeel(room.temperature_c)}</span>
      </div>
      <div className="room__tags">
        {alerts.map((a) => (
          <span key={a.id} className="tag tag--alarm" data-alert={a.kind}>
            <Icon name="triangle-alert" />
            {ALERT_KIND_LABELS[a.kind] ?? a.kind}
          </span>
        ))}
        {light && (
          <span className="tag" data-light={light.on ? "on" : "off"}>
            <Icon name={light.on ? "lightbulb" : "lightbulb-off"} />
            {light.on ? `Licht ${formatNumber(light.brightness)} %` : "Licht aus"}
          </span>
        )}
        {windowDevice && (
          <span className={cx("tag", windowDevice.open && "tag--alarm")} data-window={windowDevice.open ? "open" : "closed"}>
            <Icon name={windowDevice.open ? "door-open" : "door-closed"} />
            {windowDevice.open ? "Fenster offen" : "Fenster zu"}
          </span>
        )}
        {room.door_open !== null && (
          <span className="tag" data-door={room.door_open ? "open" : "closed"}>
            <Icon name={room.door_open ? "door-open" : "lock"} />
            {room.door_open ? "Haustür offen" : "Haustür zu"}
          </span>
        )}
        {room.motion && (
          <span className="tag" data-motion="true">
            <Icon name="activity" />
            Bewegung
          </span>
        )}
      </div>
    </Link>
  );
}

export interface FloorPlanProps {
  state: SimState;
}

/** The house as a section cut with the solar roof (design/mockups/index.html:89-227). */
export function FloorPlan({ state }: FloorPlanProps) {
  const activeAlerts = state.alerts.filter((a) => a.active);
  const known = new Set<RoomId>([...UPPER, ...GROUND]);
  const byId = new Map(state.rooms.map((r) => [r.id, r] as const));
  const upper = UPPER.map((id) => byId.get(id)).filter((r): r is Room => r !== undefined);
  const ground = [
    ...GROUND.map((id) => byId.get(id)).filter((r): r is Room => r !== undefined),
    ...state.rooms.filter((r) => !known.has(r.id)),
  ];

  const card = (room: Room) => (
    <RoomCard
      key={room.id}
      room={room}
      light={findDevice(state.devices, `${room.id}.licht`, "light")}
      windowDevice={findDevice(state.devices, `${room.id}.fenster`, "window")}
      alerts={activeAlerts.filter((a) => a.room_id === room.id)}
    />
  );

  const floors = [
    { id: "floor-upper", label: "Obergeschoss", rooms: upper },
    { id: "floor-ground", label: "Erdgeschoss", rooms: ground },
  ].filter((f) => f.rooms.length > 0);

  return (
    <section className="span-8 house" aria-label="Hausplan als Schnitt" data-od-id="house-plan">
      <div className="roof" data-od-id="roof-solar">
        <div className="solar">
          <Icon name="sun" />
          <span className="label">Solaranlage</span>
          <LiveValue className="figure" value={Math.max(0, state.solar.production_w) / 1000} decimals={1} unit="kW" />
          <span className="tag" style={{ marginLeft: "auto" }}>
            Simuliert
          </span>
        </div>
      </div>
      <div className="house__body">
        {floors.map((f) => (
          <div key={f.id} className="floor" data-od-id={f.id}>
            <p className="label">{f.label}</p>
            <div className="rooms">{f.rooms.map(card)}</div>
          </div>
        ))}
      </div>
      <div className="ground-line" />
    </section>
  );
}

export default FloorPlan;
