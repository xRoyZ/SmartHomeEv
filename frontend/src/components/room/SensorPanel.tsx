import type { ReactNode } from "react";
import type { Room } from "../../types";
import { Icon, LiveValue } from "../../ui";

export interface SensorPanelProps {
  room: Room;
  /** Whether the room's window is open; omitted when the room has no window. */
  windowOpen?: boolean | null;
  /** Summed power of the room's devices in W. */
  powerW: number;
}

interface SensorItem {
  key: string;
  label: string;
  value: ReactNode;
  alarm?: boolean;
}

function Sensor({ label, value, alarm = false }: Omit<SensorItem, "key">) {
  return (
    <div className="sensor" role="listitem" data-alarm={alarm || undefined}>
      <span className="label label--ink">{label}</span>
      <span className="figure" style={alarm ? { color: "var(--alarm-soft)" } : undefined}>
        {alarm && <Icon name="triangle-alert" />}
        {value}
      </span>
    </div>
  );
}

/**
 * The design's `sensor-strip` (design/mockups/raum.html:52): every sensor the
 * room has, live; a sensor the room lacks (null) is left out.
 */
export function SensorPanel({ room, windowOpen, powerW }: SensorPanelProps) {
  const items: SensorItem[] = [
    { key: "humidity", label: "Feuchte", value: <LiveValue value={room.humidity_pct} unit="%" /> },
    { key: "co2", label: "CO2", value: <LiveValue value={room.co2_ppm} unit="ppm" /> },
    { key: "lux", label: "Helligkeit", value: <LiveValue value={room.light_lux} unit="lx" /> },
    { key: "motion", label: "Bewegung", value: <LiveValue value={room.motion ? "ja" : "nein"} /> },
  ];
  if (windowOpen !== undefined && windowOpen !== null) {
    items.push({ key: "window", label: "Fenster", value: <LiveValue value={windowOpen ? "offen" : "zu"} /> });
  }
  if (room.door_open !== null) {
    items.push({ key: "door", label: "Haustür", value: <LiveValue value={room.door_open ? "offen" : "zu"} /> });
  }
  if (room.smoke !== null) {
    items.push({
      key: "smoke",
      label: "Rauch",
      value: <LiveValue value={room.smoke ? "erkannt" : "nein"} />,
      alarm: room.smoke,
    });
  }
  if (room.leak !== null) {
    items.push({
      key: "leak",
      label: "Wasser",
      value: <LiveValue value={room.leak ? "erkannt" : "nein"} />,
      alarm: room.leak,
    });
  }
  items.push({ key: "power", label: "Leistung", value: <LiveValue value={powerW} unit="W" /> });

  return (
    <div className="sensor-strip" data-od-id="sensor-strip" role="list" aria-label="Sensorwerte, simuliert">
      {items.map(({ key, ...item }) => (
        <Sensor key={key} {...item} />
      ))}
    </div>
  );
}

export default SensorPanel;
