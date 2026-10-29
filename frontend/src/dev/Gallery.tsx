import { useState, type ReactNode } from "react";
import { AppHeader } from "../components/chrome/AppHeader";
import { MainNav } from "../components/chrome/MainNav";
import { ALERT_KIND_LABELS, SEASON_LABELS, SPEED_LABELS, SPEEDS, WEATHER_MODE_LABELS } from "../labels";
import type { Alert, Clock, HistoryPoint, Season, SimState, Speed, WeatherMode } from "../types";
import {
  AlertList,
  AlertRow,
  Button,
  Chips,
  ClockChip,
  EditorLine,
  EmptyState,
  Field,
  Figure,
  Grid,
  IconButton,
  Input,
  InputUnit,
  LiveStatus,
  LiveValue,
  PageHead,
  Panel,
  Row,
  Segmented,
  Select,
  Span,
  Stack,
  Stepper,
  Switch,
  TextLink,
  TimeChart,
  type TimeChartSeries,
} from "../ui";

/** A user-entered name that must appear literally, never as markup (AC-20). */
export const SAMPLE_UNSAFE_NAME = "<img src=x onerror=alert(1)>";

const SAMPLE_TIME = "2026-01-14T07:42:00";

function sampleAlerts(): Alert[] {
  return [
    {
      id: "fenster_heizung:kueche",
      kind: "fenster_heizung",
      room_id: "kueche",
      message: "Fenster offen bei Heizung – Küche",
      severity: "warnung",
      raised_at: "2026-01-14T07:38:00",
      active: true,
      acknowledged: false,
    },
    {
      id: "co2_hoch:kinderzimmer",
      kind: "co2_hoch",
      room_id: "kinderzimmer",
      message: "CO2 1.420 ppm – Kinderzimmer",
      severity: "warnung",
      raised_at: "2026-01-14T07:21:00",
      active: true,
      acknowledged: false,
    },
    {
      id: "verbrauch_hoch:haus",
      kind: "verbrauch_hoch",
      room_id: null,
      message: "Stromspitze 6.340 W – Haus",
      severity: "kritisch",
      raised_at: "2026-01-13T18:47:00",
      active: false,
      acknowledged: true,
    },
  ];
}

/** A complete SimState for the gallery and the kit's tests. */
export function sampleState(overrides: Partial<SimState> = {}): SimState {
  return {
    clock: { sim_time: SAMPLE_TIME, speed: 60, paused: false },
    settings: {
      seed: 42,
      start_time: "2026-01-14T06:00:00",
      weather_mode: "auto",
      season: "winter",
      behaviour: "standard",
      speed: 60,
      adults: 2,
      children: 1,
    },
    outdoor: { temperature_c: 6.2, weather: "bewoelkt", sun_elevation_deg: 4, daylight: 0.3, sun_up: true },
    solar: { production_w: 1800, consumption_w: 2400, balance_w: -600 },
    rooms: [],
    devices: [],
    residents: [],
    alerts: sampleAlerts(),
    thresholds: { room_min_c: 18, room_max_c: 26, co2_max_ppm: 1200, power_max_w: 6000 },
    automations: [
      {
        id: 1,
        name: SAMPLE_UNSAFE_NAME,
        enabled: true,
        condition: { type: "sun", state: "down" },
        action: { device_id: "wohnzimmer.rollladen", set: { position: 100 } },
        last_fired_at: null,
      },
    ],
    activity: [{ sim_time: "2026-01-14T07:40:00", message: SAMPLE_UNSAFE_NAME, source: "automation" }],
    active_events: [],
    base_load_w: 150,
    extra_load_w: 0,
    ...overrides,
  };
}

/** 24 simulated hours of hourly points, ending at SAMPLE_TIME (deterministic). */
function hourly(f: (h: number) => number): HistoryPoint[] {
  return Array.from({ length: 25 }, (_, i) => {
    const day = i < 17 ? 13 : 14;
    const hour = (7 + i) % 24;
    return { t: `2026-01-${day}T${String(hour).padStart(2, "0")}:42:00`, v: Math.round(f(i) * 10) / 10 };
  });
}

const TEMPERATURE_SERIES: TimeChartSeries[] = [
  { key: "wohnzimmer", label: "Wohnzimmer", points: hourly((h) => 20.5 + Math.sin(h / 4) * 0.8) },
  { key: "kueche", label: "Küche", points: hourly((h) => 20 + Math.cos(h / 5) * 1.1) },
  { key: "bad", label: SAMPLE_UNSAFE_NAME, points: hourly((h) => 21.5 + Math.sin(h / 3) * 1.4) },
  { key: "aussen", label: "Außen", points: hourly((h) => 4 + Math.sin((h - 2) / 4) * 3) },
];
const CO2_SERIES: TimeChartSeries[] = [
  { key: "kinderzimmer", label: "Kinderzimmer", points: hourly((h) => 700 + h * 30) },
  { key: "schlafzimmer", label: "Schlafzimmer", points: hourly((h) => 650 + Math.sin(h / 3) * 200) },
];
const POWER_SERIES: TimeChartSeries[] = [
  { key: "verbrauch", label: "Verbrauch", points: hourly((h) => 1.2 + Math.abs(Math.sin(h / 3)) * 1.8) },
  { key: "solar", label: "Solar", points: hourly((h) => Math.max(0, Math.sin(((h - 1) / 24) * Math.PI * 2) * 2.6)) },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={title} className="stack" as="section" titleId={`gal-${title.replace(/\W+/g, "-").toLowerCase()}`}>
      {children}
    </Panel>
  );
}

function StateLabel({ children }: { children: ReactNode }) {
  return <p className="label">{children}</p>;
}

/** Component gallery (development only, /dev/galerie): every kit component in every state. */
export function Gallery() {
  const [pressed, setPressed] = useState(false);
  const [counter, setCounter] = useState(21.5);
  const [status, setStatus] = useState("Änderungen wirken sofort und sind auf allen verbundenen Geräten sichtbar.");
  const [target, setTarget] = useState(21.5);
  const [co2, setCo2] = useState(1200);
  const [switchOn, setSwitchOn] = useState(true);
  const [switchOff, setSwitchOff] = useState(false);
  const [name, setName] = useState(SAMPLE_UNSAFE_NAME);
  const [nameTouched, setNameTouched] = useState(false);
  const [op, setOp] = useState<"<" | ">">("<");
  const [speed, setSpeed] = useState<Speed>(60);
  const [metric, setMetric] = useState("temp");
  const [weather, setWeather] = useState<WeatherMode>("auto");
  const [season, setSeason] = useState<Season>("winter");
  const [room, setRoom] = useState("all");
  const [acked, setAcked] = useState<Record<string, boolean>>({});

  const running: Clock = { sim_time: SAMPLE_TIME, speed: 60, paused: false };
  const paused: Clock = { sim_time: SAMPLE_TIME, speed: 360, paused: true };
  const nameError = nameTouched && name.trim() === "" ? "Bitte einen Namen eintragen." : undefined;

  return (
    <main className="page" data-page="gallery">
      <div className="page-pad">
        <PageHead
          title="Komponenten-Galerie"
          intro="Jede Komponente des UI-Kits in jedem Zustand, den die Entwürfe zeigen. Alle Werte sind simuliert."
        />

        <div className="stack region">
          <Section title="Kopfzeile">
            <StateLabel>Verbunden, zwei offene Alarme</StateLabel>
            <AppHeader state={sampleState()} connected />
            <StateLabel>Verbindung getrennt, pausiert, keine offenen Alarme</StateLabel>
            <AppHeader
              state={sampleState({ clock: paused, alerts: [] })}
              connected={false}
            />
            <StateLabel>Noch kein Zustand empfangen</StateLabel>
            <AppHeader state={null} connected={false} />
            <StateLabel>Navigation auf der Seite „Verlauf“</StateLabel>
            <MainNav pathname="/verlauf" />
          </Section>

          <Section title="Schaltflächen">
            <Row>
              <Button variant="primary">Übernehmen</Button>
              <Button variant="primary" icon="check">
                Speichern
              </Button>
              <Button>Sekundär</Button>
              <Button size="sm" icon="plus">
                Neue Regel
              </Button>
              <Button danger icon="rotate-ccw">
                Simulation zurücksetzen
              </Button>
            </Row>
            <Row>
              <Button
                variant="primary"
                pressed={pressed}
                onClick={() => setPressed(!pressed)}
                whenOff="Pause"
                whenOn="Fortsetzen"
                icon={pressed ? "play" : "pause"}
              />
              <Button pressed={pressed} onClick={() => setPressed(!pressed)} whenOff="Fenster öffnen" whenOn="Fenster schließen" />
              <IconButton icon="pencil" label="Regel bearbeiten" onClick={() => setStatus("Bearbeiten gewählt")} />
              <IconButton icon="trash-2" label="Regel löschen" onClick={() => setStatus("Löschen gewählt")} />
              <IconButton icon="minus" round label="Senken" onClick={() => setStatus("Gesenkt")} />
              <IconButton icon="plus" round label="Erhöhen" disabled />
            </Row>
            <Row>
              <Button variant="primary" disabled disabledHint="Erst einen Namen eintragen">
                Speichern
              </Button>
              <IconButton icon="plus" round label="Erhöhen" disabled disabledHint="Maximum erreicht" />
            </Row>
          </Section>

          <Section title="Seitenkopf, Fläche und Raster">
            <PageHead title="Was das Haus meldet, bevor jemand fragt" intro="Ein Alarm bleibt sichtbar, bis ihn jemand bestätigt." />
            <Grid split>
              <Span cols={7} stack>
                <Panel title="Grenzwerte" headEnd={<span className="label">span-7</span>}>
                  <p className="small muted">Fläche mit Kopfzeile.</p>
                </Panel>
              </Span>
              <Span cols={5} stack>
                <Panel>
                  <p className="small muted">Fläche ohne Titel (span-5).</p>
                </Panel>
              </Span>
              <Span cols={4}>
                <Stack size="sm">
                  <span className="label">stack-sm</span>
                  <span className="small">span-4</span>
                </Stack>
              </Span>
            </Grid>
          </Section>

          <Section title="Live-Werte und Uhr">
            <Row>
              <LiveValue value={counter} decimals={1} unit="°C" />
              <LiveValue value={counter * 2} decimals={0} unit="W" small muted />
              <LiveValue value={null} unit="ppm" />
              <Button size="sm" onClick={() => setCounter(Math.round((counter + 0.5) * 10) / 10)}>
                Wert ändern
              </Button>
            </Row>
            <LiveStatus message={status} />
            <Row>
              <ClockChip clock={running} />
              <ClockChip clock={paused} />
              <ClockChip clock={null} />
            </Row>
            <Row>
              <Figure value={1.8} decimals={1} unit="kW" />
              <Figure value={6.2} decimals={1} unit="°" label="Außen" />
              <TextLink to="/warnungen">Alle Alarme</TextLink>
              <TextLink to="/" icon="arrow-left">
                Zur Übersicht
              </TextLink>
            </Row>
          </Section>

          <Section title="Alarme">
            <AlertList aria-label="Beispielalarme">
              <AlertRow
                kind="fenster_heizung"
                title="Fenster offen bei Heizung – Küche"
                meta="seit 07:38"
                isNew
                acknowledged={acked.a === true}
                onAcknowledge={() => setAcked({ ...acked, a: true })}
              />
              <AlertRow kind="co2_hoch" title={SAMPLE_UNSAFE_NAME} meta="seit 07:21" onAcknowledge={() => setAcked({ ...acked, b: true })} acknowledged={acked.b === true} />
              <AlertRow kind="rauch" title={ALERT_KIND_LABELS.rauch} meta="seit 07:40" ackPending onAcknowledge={() => undefined} />
            </AlertList>
            <AlertList>
              <AlertRow
                large
                as="article"
                titleAs="h3"
                kind="wasser"
                title="Wasser erkannt – Bad"
                meta="seit Mi 07:30 · Leckmelder schlägt an"
                ackPrimary
                acknowledged={acked.c === true}
                onAcknowledge={() => setAcked({ ...acked, c: true })}
              />
              <AlertRow large as="article" titleAs="h3" kind="verbrauch_hoch" title="Stromspitze 6.340 W – Haus" meta="Di 18:47" acknowledged ackNote="Bestätigt Di 18:49" />
            </AlertList>
            <EmptyState title="Alles ruhig" text="Im ganzen Haus liegt gerade kein Alarm vor." />
          </Section>

          <Section title="Eingaben">
            <Row>
              <Stepper label="Zieltemperatur" value={target} min={5} max={30} step={0.5} decimals={1} unit="°" onChange={setTarget} />
              <Stepper label="CO2-Grenze" value={co2} min={400} max={5000} step={50} unit="ppm" valueMinWidth="5.4ch" onChange={setCo2} />
              <Stepper label="Minimum" value={5} min={5} max={25} step={1} unit="°" onChange={() => undefined} />
              <Stepper label="Gesperrt" value={18} min={5} max={25} step={1} unit="°" disabled onChange={() => undefined} />
            </Row>
            <Row>
              <Switch label="Fernseher" checked={switchOn} onChange={setSwitchOn} />
              <Switch label="Stehlampe" checked={switchOff} onChange={setSwitchOff} whenOn="an" whenOff="aus" />
              <Switch label={SAMPLE_UNSAFE_NAME} checked onChange={() => undefined} disabled disabledHint="Gerät ist ausgefallen" />
            </Row>
            <Field label="Name" htmlFor="gal-name" error={nameError}>
              <Input
                id="gal-name"
                type="text"
                value={name}
                maxLength={80}
                invalid={nameError !== undefined}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setNameTouched(true)}
              />
            </Field>
            <Field label="Name (Fehler)" htmlFor="gal-name-err" error="Bitte einen Namen eintragen.">
              <Input id="gal-name-err" type="text" defaultValue="" invalid />
            </Field>
            <EditorLine>
              <Field label="Sensor" htmlFor="gal-sensor">
                <Select
                  id="gal-sensor"
                  value="kueche"
                  onChange={() => undefined}
                  options={[
                    { value: "kueche", label: "Temperatur Küche" },
                    { value: "bad", label: "Feuchte Bad" },
                  ]}
                />
              </Field>
              <Field label="Ist" htmlFor="gal-op">
                <Select<"<" | ">">
                  id="gal-op"
                  value={op}
                  onChange={setOp}
                  options={[
                    { value: "<", label: "<" },
                    { value: ">", label: ">" },
                  ]}
                />
              </Field>
              <Field label="Wert" htmlFor="gal-val">
                <InputUnit>
                  <Input id="gal-val" type="number" inputMode="decimal" defaultValue={18} />
                  <span className="small muted">°C</span>
                </InputUnit>
              </Field>
            </EditorLine>
            <EditorLine cols={2}>
              <Field label="Gerät" htmlFor="gal-device">
                <Input id="gal-device" type="text" defaultValue="Heizung Küche" disabled />
              </Field>
              <Field label="Startzeit" htmlFor="gal-time">
                <Input id="gal-time" type="time" defaultValue="06:00" />
              </Field>
            </EditorLine>
            <Segmented
              label="Tempo"
              options={SPEEDS.map((s) => ({ value: s, label: SPEED_LABELS[s] }))}
              value={speed}
              onChange={setSpeed}
            />
            <Segmented
              label="Größe"
              ink
              options={[
                { value: "temp", label: "Temperatur" },
                { value: "hum", label: "Feuchte" },
                { value: "co2", label: "CO2" },
                { value: "energy", label: "Verbrauch vs. Solar", disabled: true },
              ]}
              value={metric}
              onChange={setMetric}
            />
            <Chips
              label="Wetter"
              options={(Object.keys(WEATHER_MODE_LABELS) as WeatherMode[]).map((w) => ({ value: w, label: WEATHER_MODE_LABELS[w] }))}
              value={weather}
              onChange={setWeather}
            />
            <Chips
              label="Jahreszeit"
              options={(Object.keys(SEASON_LABELS) as Season[]).map((s) => ({ value: s, label: SEASON_LABELS[s] }))}
              value={season}
              onChange={setSeason}
            />
            <Chips
              label="Raum"
              options={[
                { value: "all", label: "Alle Räume" },
                { value: "bad", label: SAMPLE_UNSAFE_NAME },
              ]}
              value={room}
              onChange={setRoom}
              disabled
              disabledHint="Der Verbrauch gilt für das ganze Haus, deshalb gilt die Raumauswahl hier nicht."
            />
          </Section>

          <Section title="Verläufe">
            <TimeChart
              series={TEMPERATURE_SERIES}
              ariaLabel="Raumtemperaturen gegenüber der Außentemperatur, letzte 24 Stunden Simulationszeit"
              unit="°"
              decimals={1}
              now={SAMPLE_TIME}
            />
            <TimeChart
              series={CO2_SERIES}
              ariaLabel="CO2 je Raum mit Grenzwert, letzte 24 Stunden Simulationszeit"
              unit=" ppm"
              now={SAMPLE_TIME}
              limit={{ value: 1200, label: "Grenze" }}
            />
            <TimeChart
              series={POWER_SERIES}
              ariaLabel="Verbrauch gegenüber Solarertrag, letzte 24 Stunden Simulationszeit"
              unit=" kW"
              decimals={1}
              now={SAMPLE_TIME}
            />
            <TimeChart
              mini
              series={TEMPERATURE_SERIES.filter((s) => s.key === "wohnzimmer" || s.key === "aussen")}
              ariaLabel="Wohnzimmer gegenüber Außen, letzte 24 Stunden Simulationszeit"
              unit="°"
              decimals={1}
              now={SAMPLE_TIME}
            />
            <TimeChart series={[]} ariaLabel="Leerer Verlauf" />
          </Section>
        </div>
      </div>
    </main>
  );
}

export default Gallery;
