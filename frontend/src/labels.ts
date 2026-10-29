// German labels for every enum of the contract. Room and device names come
// from the backend and are rendered as they arrive.
import type {
  ActivitySource,
  AlertKind,
  AlertSeverity,
  Behaviour,
  DeviceKind,
  EventType,
  HistoryMetric,
  ResidentRole,
  RoomActivity,
  RoomId,
  Season,
  SensorMetric,
  Speed,
  Weather,
  WeatherMode,
} from "./types";

export const WEATHER_LABELS: Record<Weather, string> = {
  sonnig: "Sonnig",
  bewoelkt: "Bewölkt",
  regen: "Regen",
  schnee: "Schnee",
};

export const WEATHER_MODE_LABELS: Record<WeatherMode, string> = {
  auto: "Automatisch",
  ...WEATHER_LABELS,
};

export const SEASON_LABELS: Record<Season, string> = {
  fruehling: "Frühling",
  sommer: "Sommer",
  herbst: "Herbst",
  winter: "Winter",
};

export const BEHAVIOUR_LABELS: Record<Behaviour, string> = {
  standard: "Standard",
  homeoffice: "Homeoffice",
  urlaub: "Urlaub",
};

export const SPEEDS: readonly Speed[] = [1, 60, 360, 1440];

export const SPEED_LABELS: Record<Speed, string> = {
  1: "1x",
  60: "60x",
  360: "360x",
  1440: "1440x",
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  fenster_vergessen: "Fenster vergessen",
  wasserschaden: "Wasserschaden",
  rauch_kueche: "Rauch in der Küche",
  stromspitze: "Stromspitze",
  heizungsausfall: "Heizungsausfall",
};

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  zu_kalt: "Zu kalt",
  zu_warm: "Zu warm",
  co2_hoch: "CO2 zu hoch",
  rauch: "Rauch erkannt",
  wasser: "Wasser erkannt",
  verbrauch_hoch: "Verbrauch zu hoch",
  fenster_heizung: "Fenster offen bei Heizung",
  heizungsausfall: "Heizungsausfall",
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  warnung: "Warnung",
  kritisch: "Kritisch",
};

export const DEVICE_KIND_LABELS: Record<DeviceKind, string> = {
  thermostat: "Heizung",
  light: "Licht",
  shutter: "Rollladen",
  window: "Fenster",
  plug: "Steckdose",
  appliance: "Gerät",
};

/** Fallback only: the backend sends each room's name with the state. */
export const ROOM_LABELS: Record<RoomId, string> = {
  wohnzimmer: "Wohnzimmer",
  kueche: "Küche",
  schlafzimmer: "Schlafzimmer",
  kinderzimmer: "Kinderzimmer",
  bad: "Bad",
  flur: "Flur",
};

export const ROOM_ACTIVITY_LABELS: Record<RoomActivity, string> = {
  none: "Keine Aktivität",
  duschen: "Duschen",
  kochen: "Kochen",
  schlafen: "Schlafen",
};

export const RESIDENT_ROLE_LABELS: Record<ResidentRole, string> = {
  erwachsen: "Erwachsen",
  kind: "Kind",
};

export const ACTIVITY_SOURCE_LABELS: Record<ActivitySource, string> = {
  automation: "Automation",
  ereignis: "Ereignis",
  benutzer: "Bedienung",
  system: "System",
};

export const SENSOR_METRIC_LABELS: Record<SensorMetric, string> = {
  temperature_c: "Temperatur",
  humidity_pct: "Luftfeuchte",
  co2_ppm: "CO2",
};

export const HISTORY_METRIC_LABELS: Record<HistoryMetric, string> = {
  temperature: "Temperatur",
  humidity: "Luftfeuchte",
  co2: "CO2",
  power: "Verbrauch und Solar",
};

export const SUN_STATE_LABELS: Record<"up" | "down", string> = {
  up: "Sonnenaufgang",
  down: "Sonnenuntergang",
};
