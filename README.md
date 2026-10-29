# Smart-Home-Simulator mit Live-Zentrale

Der Smart-Home-Simulator ist ein komplettes Smart Home als Software – gedacht für Vorführungen vor einem nicht-technischen Publikum. Ein Python-Backend simuliert ein bewohntes Einfamilienhaus mit sechs Räumen (Wohnzimmer, Küche, Schlafzimmer, Kinderzimmer, Bad, Flur), Außenwetter, Tag und Nacht, Sensoren, Geräten, Bewohnern und einer Solaranlage. Die Simulation läuft auf einer deterministischen, per Seed reproduzierbaren Uhr, die sich pausieren, beschleunigen und zurücksetzen lässt. Eine deutschsprachige, responsive Web-App (Laptop und Smartphone) zeigt das Haus live per WebSocket, erlaubt das Bedienen aller Geräte, das Anlegen von Wenn-dann-Automationen, das Einstellen von Warnschwellen, das Auslösen von Ereignissen und das Verändern der Simulationsbedingungen. Alle Clients im lokalen Netz sehen denselben Zustand in Echtzeit. Alles läuft offline – ohne Konten, ohne echte Hardware. Alle angezeigten Werte sind simuliert.

## Funktionen

- **Live-Hausübersicht**: alle sechs Räume mit Temperatur, Luftfeuchte, CO₂, Helligkeit und Bewegung, dazu Außenwetter, Simulationszeit, Verbrauch und Solarertrag – ohne Neuladen aktualisiert.
- **Glaubwürdige Simulation**: Raumtemperaturen folgen der Heizung und fallen bei offenem Fenster, der Verbrauch ergibt sich aus laufenden Geräten plus Grundlast, die Solaranlage liefert nachts nichts und folgt dem Wetter, Bewohner verursachen Bewegung und Gerätenutzung nach einem Tagesablauf.
- **Gerätesteuerung**: Heizung (Zieltemperatur), Licht und Dimmer, Rollläden, Fenster, Steckdosen (Fernseher, Stehlampe) und Haushaltsgeräte mit Programmen (Waschmaschine, Geschirrspüler, Kühlschrank, Backofen, Kaffeemaschine).
- **Automationen**: Wenn-dann-Regeln mit Bedingungen auf Sensorwerte, Fensterkontakte, Bewegung, Uhrzeit oder Sonnenstand; anlegen, bearbeiten, aktivieren/deaktivieren, löschen (höchstens 100). Drei Standard-Automationen sind nach einem Zurücksetzen vorhanden. Jede Auslösung erscheint mit Simulationszeit im Aktivitätsprotokoll.
- **Warnungen und Schwellwerte**: zu kalt, zu warm, CO₂ hoch, Rauch, Wasser, Verbrauch hoch, Fenster offen bei laufender Heizung, Heizungsausfall; Warnungen lassen sich quittieren, Schwellwerte wirken sofort.
- **Ereignisse**: Fenster vergessen, Wasserschaden, Rauch in der Küche, Stromspitze, Heizungsausfall.
- **Verlauf**: Raumtemperaturen gegenüber außen, Luftfeuchte, CO₂ sowie Verbrauch gegenüber Solar über bis zu 168 simulierte Stunden (Standard 24).
- **Simulationssteuerung**: Pause/Weiter, Geschwindigkeiten 1×, 60×, 360× und 1440× (ein simulierter Tag in etwa einer echten Minute), Wetter, Jahreszeit, Bewohnerverhalten (Standard, Homeoffice, Urlaub), Seed, Startzeit, Anzahl Erwachsene/Kinder, Zurücksetzen.
- **Mehrere Clients gleichzeitig**: Laptop und Smartphone zeigen denselben Zustand; eine Änderung auf einem Gerät ist innerhalb einer Sekunde auf allen anderen sichtbar.
- **Persistenz**: Automationen, Schwellwerte, Einstellungen und Verlauf überstehen einen Neustart des Backends (SQLite).

## Dienste

| Dienst | Verzeichnis | Aufgabe |
|---|---|---|
| `api` | `backend/` | FastAPI-Server: Simulation, REST-API, WebSocket `/ws`, SQLite-Datenbank |
| `web` | `frontend/` | Vite + React + TypeScript: die Web-App |

## Technik

- **Backend**: Python 3.12+, FastAPI, uvicorn, pydantic v2, asyncio-Simulationsschleife, WebSocket-Broadcast
- **Datenbank**: SQLite-Datei über die Python-Standardbibliothek (`sqlite3`, ausschließlich parametrisierte Abfragen)
- **Frontend**: Vite, React, TypeScript, lokal gebündelte Diagrammbibliothek
- **Tests**: pytest (Backend), vitest (Frontend)

## Installation

Voraussetzungen: Python 3.12 oder neuer, Node.js 20 oder neuer mit npm.

```bash
git clone <repository-url> smarthome
cd smarthome

# Backend-Abhängigkeiten
python3 -m pip install -r backend/requirements.txt

# Frontend-Abhängigkeiten
cd frontend && npm install && cd ..
```

Eine Konfiguration ist nicht nötig: Ohne gesetzte Umgebungsvariablen legt das Backend seine Datenbank unter `backend/data/smarthome.db` an und erlaubt Aufrufe von `localhost` und aus dem privaten Heimnetz.

## Starten (Entwicklung)

Ein einziger Befehl im Wurzelverzeichnis startet Backend und Frontend gemeinsam:

```bash
./dev.sh
```

- Backend: `http://localhost:8000` (uvicorn auf `0.0.0.0`, Port 8000)
- Frontend: `http://localhost:5173` (Vite-Entwicklungsserver mit `--host`)

`./dev.sh` installiert fehlende Abhängigkeiten beim ersten Start selbst. `Strg+C` beendet beide Prozesse. Die Simulation läuft sofort nach dem Start von selbst los.

Einzeln starten geht auch:

```bash
# Backend
cd backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend (zweites Terminal)
cd frontend
npm run dev -- --host
```

### Vom Smartphone öffnen

1. Laptop und Smartphone müssen im selben WLAN sein.
2. Die LAN-IP des Laptops herausfinden, z. B. mit `ip addr` (Linux), `ipconfig getifaddr en0` (macOS) oder `ipconfig` (Windows) – etwa `192.168.1.23`.
3. Auf dem Smartphone `http://192.168.1.23:5173` öffnen.

Die Web-App spricht das Backend automatisch unter derselben Adresse auf Port 8000 an (`http://192.168.1.23:8000`). Das Backend erlaubt Aufrufe aus den privaten Netzen `10.x.x.x`, `172.16–31.x.x` und `192.168.x.x` auf jedem Port. Falls eine Firewall aktiv ist, müssen die Ports 5173 und 8000 im lokalen Netz freigegeben sein.

## Bauen für den Produktivbetrieb

```bash
cd frontend
npm run build          # erzeugt frontend/dist/
```

Den Inhalt von `frontend/dist/` mit einem beliebigen statischen Webserver ausliefern (z. B. `npx vite preview --host` im Verzeichnis `frontend/`) und das Backend ohne Entwicklungswerkzeuge starten:

```bash
cd backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Tests

```bash
cd backend && python3 -m pytest
cd frontend && npm test
```

## Umgebungsvariablen

| Variable | Dienst | Standard | Bedeutung |
|---|---|---|---|
| `SMARTHOME_DB_PATH` | api | `data/smarthome.db` (relativ zu `backend/`) | Pfad der SQLite-Datenbank; der Ordner wird bei Bedarf angelegt |
| `SMARTHOME_CORS_ORIGIN` | api | – | Zusätzlich erlaubte Herkunft der Web-App (z. B. `http://localhost:5173`, mehrere durch Komma getrennt). `localhost`, `127.0.0.1` und private LAN-Adressen sind immer erlaubt |
| `VITE_API_BASE` | web | `<Protokoll>//<Hostname der Seite>:8000` | Basis-URL des Backends; die WebSocket-Adresse ist dieselbe mit `ws://` statt `http://` plus `/ws` |

Geheimnisse gibt es keine – das Produkt hat weder Konten noch externe Dienste.

## Bedienung der Web-App

| Seite | Pfad | Inhalt |
|---|---|---|
| Übersicht | `/` | Grundriss mit allen Räumen, Außenwetter, Uhrzeit, Verbrauch und Solar auf einen Blick |
| Raum | `/raum/<raum-id>` | Sensorwerte eines Raums und die Steuerung seiner Geräte |
| Automationen | `/automationen` | Regeln anlegen, bearbeiten, ein-/ausschalten, löschen; Aktivitätsprotokoll |
| Warnungen | `/warnungen` | Aktive und vergangene Warnungen quittieren, Schwellwerte einstellen |
| Verlauf | `/verlauf` | Diagramme für Temperatur, Luftfeuchte, CO₂ und Leistung |
| Einstellungen | `/einstellungen` | Uhr (Pause, Geschwindigkeit), Wetter, Jahreszeit, Verhalten, Seed, Bewohner, Zurücksetzen, Ereignisse auslösen |

Raum-IDs: `wohnzimmer`, `kueche`, `schlafzimmer`, `kinderzimmer`, `bad`, `flur`.

## REST-API

Basis-URL: `http://<host>:8000`. Alle Zeitangaben sind Simulationszeit im ISO-8601-Format ohne Zeitzone (z. B. `2026-01-15T06:00:00`). Fehler kommen als `{"detail": "…"}`; ungültige Eingaben werden mit `422` abgewiesen und ändern den Zustand nicht, unbekannte IDs ergeben `404`. Die interaktive Dokumentation liegt unter `http://<host>:8000/docs`.

### Zustand

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| GET | `/api/health` | – | `200 {"status": "ok"}` |
| GET | `/api/state` | – | `200` vollständiger Zustand (`SimState`, siehe unten) |

Beispiel `GET /api/state` (gekürzt):

```json
{
  "clock": {"sim_time": "2026-01-15T06:00:30", "speed": 60, "paused": false},
  "settings": {"seed": 42, "start_time": "2026-01-15T06:00:00", "weather_mode": "auto",
               "season": "winter", "behaviour": "standard", "speed": 60, "adults": 2, "children": 1},
  "outdoor": {"temperature_c": -1.8, "weather": "bewoelkt", "sun_elevation_deg": -8.0,
              "daylight": 0.0, "sun_up": false},
  "solar": {"production_w": 0.0, "consumption_w": 240.0, "balance_w": -240.0},
  "rooms": [{"id": "wohnzimmer", "name": "Wohnzimmer", "temperature_c": 20.2, "humidity_pct": 45.0,
             "co2_ppm": 600.0, "light_lux": 0.0, "motion": false, "last_motion_at": null,
             "activity": "none", "smoke": null, "leak": null, "door_open": null}],
  "devices": [{"id": "wohnzimmer.heizung", "room_id": "wohnzimmer", "name": "Heizung",
               "power_w": 0.0, "kind": "thermostat", "target_c": 21.0, "heating": true, "failed": false}],
  "residents": [{"id": "anna", "name": "Anna", "role": "erwachsen", "room_id": "schlafzimmer",
                 "activity": "schläft"}],
  "alerts": [],
  "thresholds": {"room_min_c": 18.0, "room_max_c": 26.0, "co2_max_ppm": 1200, "power_max_w": 6000},
  "automations": [],
  "activity": [],
  "active_events": [],
  "base_load_w": 150.0,
  "extra_load_w": 0.0
}
```

`balance_w` = Produktion − Verbrauch: positiv bedeutet Einspeisung, negativ Netzbezug.

### Geräte

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| PATCH | `/api/devices/{device_id}` | `DeviceUpdate` | `200 Device` · `404` · `422` |

`DeviceUpdate` – alle Felder optional, nur passende Felder je Gerätetyp sind erlaubt:
`{"on": bool, "brightness": 0..100, "position": 0..100, "open": bool, "target_c": 5..30, "program": str|null}`

Gerätetypen (`kind`) und ihre Felder:

| `kind` | Felder | Geräte |
|---|---|---|
| `thermostat` | `target_c` (5–30), `heating`, `failed` | `<raum>.heizung` in jedem Raum |
| `light` | `on`, `brightness` (0–100) | `<raum>.licht` in jedem Raum |
| `window` | `open` | `<raum>.fenster` in jedem Raum |
| `shutter` | `position` (0–100, 100 = ganz geschlossen) | `wohnzimmer.rollladen`, `schlafzimmer.rollladen`, `kinderzimmer.rollladen`, `kueche.rollladen` |
| `plug` | `on`, `rated_w` | `wohnzimmer.tv`, `wohnzimmer.stehlampe` |
| `appliance` | `on`, `program` (aus `programs`), `programs`, `rated_w` | `bad.waschmaschine`, `kueche.geschirrspueler`, `kueche.kuehlschrank`, `kueche.backofen`, `kueche.kaffeemaschine` |

Jedes Gerät hat zusätzlich `id`, `room_id`, `name` und `power_w` (aktuelle Leistung).

Beispiel:

```bash
curl -X PATCH http://localhost:8000/api/devices/wohnzimmer.licht \
     -H 'Content-Type: application/json' -d '{"on": true, "brightness": 60}'
```

```json
{"id": "wohnzimmer.licht", "room_id": "wohnzimmer", "name": "Licht", "power_w": 6.0,
 "kind": "light", "on": true, "brightness": 60}
```

### Ereignisse

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| POST | `/api/events` | `{"type": EventType}` | `201 ActiveEvent` · `422` |

`EventType`: `fenster_vergessen`, `wasserschaden`, `rauch_kueche`, `stromspitze`, `heizungsausfall`.

```json
{"type": "rauch_kueche", "room_id": "kueche", "started_at": "2026-01-15T07:12:00", "ends_at": "2026-01-15T07:42:00"}
```

### Warnungen und Schwellwerte

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| GET | `/api/alerts` | – | `200 Alert[]` |
| POST | `/api/alerts/{alert_id}/acknowledge` | – | `200 Alert` · `404` |
| GET | `/api/thresholds` | – | `200 Thresholds` |
| PUT | `/api/thresholds` | `Thresholds` | `200 Thresholds` · `422` |

`Alert`: `{"id": "zu_kalt:bad", "kind": "zu_kalt", "room_id": "bad", "message": "Bad ist zu kalt (16,8 °C)", "severity": "warnung", "raised_at": "2026-01-15T07:00:00", "active": true, "acknowledged": false}` – die ID lautet `<art>:<raum-id>` bzw. `<art>:haus` für das ganze Haus; `severity` ist `warnung` oder `kritisch`. Arten: `zu_kalt`, `zu_warm`, `co2_hoch`, `rauch`, `wasser`, `verbrauch_hoch`, `fenster_heizung`, `heizungsausfall`.

`Thresholds`: `{"room_min_c": 5..25 (18), "room_max_c": 15..35 (26), "co2_max_ppm": 400..5000 (1200), "power_max_w": 500..20000 (6000)}`; `room_min_c` muss kleiner als `room_max_c` sein, sonst `422`.

### Automationen

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| GET | `/api/automations` | – | `200 Automation[]` |
| POST | `/api/automations` | `AutomationIn` | `201 Automation` · `409` (bereits 100 gespeichert) · `422` |
| PUT | `/api/automations/{id}` | `AutomationIn` | `200 Automation` · `404` · `422` |
| PATCH | `/api/automations/{id}/enabled` | `{"enabled": bool}` | `200 Automation` · `404` · `422` |
| DELETE | `/api/automations/{id}` | – | `204` · `404` |

`AutomationIn`: `{"name": str (1–80 Zeichen), "enabled": bool, "condition": Condition, "action": {"device_id": str, "set": DeviceUpdate}}`.
`Automation` ergänzt `id` (Zahl) und `last_fired_at` (Zeit oder `null`).

Bedingungen (`condition.type`):

| `type` | Felder |
|---|---|
| `sensor` | `room_id` (Raum oder `null` = außen, dann nur `temperature_c`), `metric` (`temperature_c`, `humidity_pct`, `co2_ppm`), `op` (`<`, `>`), `value` |
| `contact` | `device_id` (ein Fenster, z. B. `bad.fenster`), `open` |
| `motion` | `room_id`, `detected`, `minutes` (1–240) |
| `time` | `at` (`"HH:MM"`) |
| `sun` | `state` (`up`, `down`) |

Beispiel:

```json
{
  "name": "Abends Rollläden schließen",
  "enabled": true,
  "condition": {"type": "sun", "state": "down"},
  "action": {"device_id": "wohnzimmer.rollladen", "set": {"position": 100}}
}
```

### Verlauf

| Methode | Pfad | Parameter | Antwort |
|---|---|---|---|
| GET | `/api/history` | `metric` (`temperature`, `humidity`, `co2`, `power`), `room_id` (optional), `hours` (1–168, Standard 24) | `200 HistoryResponse` · `422` |

```json
{
  "metric": "temperature",
  "from_time": "2026-01-14T07:00:00",
  "to_time": "2026-01-15T07:00:00",
  "series": [
    {"key": "wohnzimmer", "label": "Wohnzimmer", "points": [{"t": "2026-01-15T06:00:00", "v": 20.2}]},
    {"key": "aussen", "label": "Außen", "points": [{"t": "2026-01-15T06:00:00", "v": -1.8}]}
  ]
}
```

Serien: `temperature` – jeder Raum (oder der gewählte) plus `aussen`; `humidity`/`co2` – jeder Raum (oder der gewählte); `power` – `verbrauch` und `solar`.

### Simulation

| Methode | Pfad | Body | Antwort |
|---|---|---|---|
| POST | `/api/simulation/pause` | – | `200 Clock` |
| POST | `/api/simulation/resume` | – | `200 Clock` |
| PUT | `/api/simulation/speed` | `{"speed": 1 \| 60 \| 360 \| 1440}` | `200 Clock` · `422` |
| GET | `/api/simulation/settings` | – | `200 Settings` |
| PUT | `/api/simulation/settings` | `SettingsUpdate` | `200 Settings` · `422` |
| POST | `/api/simulation/reset` | – | `200 SimState` |

`Clock`: `{"sim_time": "2026-01-15T06:00:00", "speed": 60, "paused": false}`

`Settings`: `{"seed": 0..2147483647 (42), "start_time": "2026-01-15T06:00:00", "weather_mode": "auto"|"sonnig"|"bewoelkt"|"regen"|"schnee", "season": "fruehling"|"sommer"|"herbst"|"winter", "behaviour": "standard"|"homeoffice"|"urlaub", "speed": 1|60|360|1440, "adults": 1..4 (2), "children": 0..3 (1)}`.
`SettingsUpdate` enthält dieselben Felder, alle optional. `weather_mode`, `season`, `behaviour` und `speed` wirken sofort; `seed`, `start_time`, `adults` und `children` beim nächsten Zurücksetzen. Mit gleichem Seed und gleichen Einstellungen liefert dieselbe Folge von Eingaben dieselben Werte.

## WebSocket-Protokoll

Adresse: `ws://<host>:8000/ws`

Server → Client:

- `{"type": "state", "state": SimState}` – direkt nach dem Verbinden, nach jedem Simulationstakt (alle 0,5 Sekunden) und nach jeder Änderung.
- `{"type": "pong"}` – Antwort auf `ping`.
- `{"type": "error", "detail": "…"}` – Antwort auf eine ungültige Nachricht.

Client → Server:

- `{"type": "ping"}` – sonst nichts; Änderungen laufen über die REST-API.

Eine Nachricht über 65 536 Bytes, eine nicht als JSON lesbare Nachricht oder eine mit unbekanntem Typ wird mit einer `error`-Nachricht beantwortet und verworfen: Die Verbindung bleibt offen, der Zustand bleibt unverändert, die Simulation und alle anderen Clients laufen weiter.

Beispiel mit Python:

```python
import asyncio, json, websockets

async def main():
    async with websockets.connect("ws://localhost:8000/ws") as ws:
        message = json.loads(await ws.recv())
        print(message["state"]["clock"]["sim_time"])

asyncio.run(main())
```
