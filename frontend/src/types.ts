// Shared types — a 1:1 mirror of backend/app/sim/state.py (the sprint contract).
// Datetimes are naive ISO-8601 simulation-time strings.

export type ISODateTime = string;

export type RoomId = "wohnzimmer" | "kueche" | "schlafzimmer" | "kinderzimmer" | "bad" | "flur";

export type Weather = "sonnig" | "bewoelkt" | "regen" | "schnee";
export type WeatherMode = "auto" | Weather;
export type Season = "fruehling" | "sommer" | "herbst" | "winter";
export type Behaviour = "standard" | "homeoffice" | "urlaub";
export type Speed = 1 | 60 | 360 | 1440;

export type EventType =
  | "fenster_vergessen"
  | "wasserschaden"
  | "rauch_kueche"
  | "stromspitze"
  | "heizungsausfall";

export type AlertKind =
  | "zu_kalt"
  | "zu_warm"
  | "co2_hoch"
  | "rauch"
  | "wasser"
  | "verbrauch_hoch"
  | "fenster_heizung"
  | "heizungsausfall";

export type AlertSeverity = "warnung" | "kritisch";

export interface Clock {
  sim_time: ISODateTime;
  speed: Speed;
  paused: boolean;
}

export interface Settings {
  seed: number;
  start_time: ISODateTime;
  weather_mode: WeatherMode;
  season: Season;
  behaviour: Behaviour;
  speed: Speed;
  adults: number;
  children: number;
}

export type SettingsUpdate = Partial<Settings>;

export interface Outdoor {
  temperature_c: number;
  weather: Weather;
  sun_elevation_deg: number;
  daylight: number;
  sun_up: boolean;
}

export interface Solar {
  production_w: number;
  consumption_w: number;
  /** production - consumption; > 0 Einspeisung, < 0 Netzbezug */
  balance_w: number;
}

export type RoomActivity = "none" | "duschen" | "kochen" | "schlafen";

export interface Room {
  id: RoomId;
  name: string;
  temperature_c: number;
  humidity_pct: number;
  co2_ppm: number;
  light_lux: number;
  motion: boolean;
  last_motion_at: ISODateTime | null;
  activity: RoomActivity;
  /** null = the room has no such sensor */
  smoke: boolean | null;
  leak: boolean | null;
  door_open: boolean | null;
}

export type DeviceKind = "thermostat" | "light" | "shutter" | "window" | "plug" | "appliance";

interface DeviceBase {
  id: string;
  room_id: RoomId;
  name: string;
  power_w: number;
}

export interface ThermostatDevice extends DeviceBase {
  kind: "thermostat";
  target_c: number;
  heating: boolean;
  failed: boolean;
}

export interface LightDevice extends DeviceBase {
  kind: "light";
  on: boolean;
  brightness: number;
}

export interface ShutterDevice extends DeviceBase {
  kind: "shutter";
  /** 0..100, 100 = fully closed */
  position: number;
}

export interface WindowDevice extends DeviceBase {
  kind: "window";
  open: boolean;
}

export interface PlugDevice extends DeviceBase {
  kind: "plug";
  on: boolean;
  rated_w: number;
}

export interface ApplianceDevice extends DeviceBase {
  kind: "appliance";
  on: boolean;
  program: string | null;
  programs: string[];
  rated_w: number;
}

export type Device =
  | ThermostatDevice
  | LightDevice
  | ShutterDevice
  | WindowDevice
  | PlugDevice
  | ApplianceDevice;

export interface DeviceUpdate {
  on?: boolean;
  brightness?: number;
  position?: number;
  open?: boolean;
  target_c?: number;
  program?: string | null;
}

export type ResidentRole = "erwachsen" | "kind";

export interface Resident {
  id: string;
  name: string;
  role: ResidentRole;
  /** null = away */
  room_id: RoomId | null;
  activity: string;
}

export interface Thresholds {
  room_min_c: number;
  room_max_c: number;
  co2_max_ppm: number;
  power_max_w: number;
}

export interface Alert {
  /** "<kind>:<room_id or 'haus'>" */
  id: string;
  kind: AlertKind;
  room_id: RoomId | null;
  message: string;
  severity: AlertSeverity;
  raised_at: ISODateTime;
  active: boolean;
  acknowledged: boolean;
}

export type SensorMetric = "temperature_c" | "humidity_pct" | "co2_ppm";

export interface SensorCondition {
  type: "sensor";
  /** null = outdoor, metric must be temperature_c */
  room_id: RoomId | null;
  metric: SensorMetric;
  op: "<" | ">";
  value: number;
}

export interface ContactCondition {
  type: "contact";
  device_id: string;
  open: boolean;
}

export interface MotionCondition {
  type: "motion";
  room_id: RoomId;
  detected: boolean;
  minutes: number;
}

export interface TimeCondition {
  type: "time";
  /** "HH:MM" */
  at: string;
}

export interface SunCondition {
  type: "sun";
  state: "up" | "down";
}

export type Condition =
  | SensorCondition
  | ContactCondition
  | MotionCondition
  | TimeCondition
  | SunCondition;

export interface Action {
  device_id: string;
  set: DeviceUpdate;
}

export interface AutomationIn {
  name: string;
  enabled: boolean;
  condition: Condition;
  action: Action;
}

export interface Automation extends AutomationIn {
  id: number;
  last_fired_at: ISODateTime | null;
}

export type ActivitySource = "automation" | "ereignis" | "benutzer" | "system";

export interface ActivityEntry {
  sim_time: ISODateTime;
  message: string;
  source: ActivitySource;
}

export interface ActiveEvent {
  type: EventType;
  room_id: RoomId | null;
  started_at: ISODateTime;
  ends_at: ISODateTime | null;
}

export interface SimState {
  clock: Clock;
  settings: Settings;
  outdoor: Outdoor;
  solar: Solar;
  rooms: Room[];
  devices: Device[];
  residents: Resident[];
  alerts: Alert[];
  thresholds: Thresholds;
  automations: Automation[];
  /** newest first, max 200 */
  activity: ActivityEntry[];
  active_events: ActiveEvent[];
  base_load_w: number;
  extra_load_w: number;
}

export type HistoryMetric = "temperature" | "humidity" | "co2" | "power";

export interface HistoryPoint {
  t: ISODateTime;
  v: number;
}

export interface HistorySeries {
  key: string;
  label: string;
  points: HistoryPoint[];
}

export interface HistoryResponse {
  metric: HistoryMetric;
  from_time: ISODateTime;
  to_time: ISODateTime;
  series: HistorySeries[];
}

/** Messages the server sends over /ws. */
export type ServerMessage =
  | { type: "state"; state: SimState }
  | { type: "pong" }
  | { type: "error"; detail: string };

/** Messages the client may send over /ws. */
export type ClientMessage = { type: "ping" };
