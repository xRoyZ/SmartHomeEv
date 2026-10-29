import type { CSSProperties } from "react";
import { WEATHER_LABELS } from "../../labels";
import type { Outdoor, Solar, Weather } from "../../types";
import { Figure, formatNumber, Icon, type IconName } from "../../ui";

/** Icon per weather of the kit's icon set (design/mockups/index.html:235 shows cloud). */
const WEATHER_ICONS: Record<Weather, IconName> = {
  sonnig: "sun",
  bewoelkt: "cloud",
  regen: "droplets",
  schnee: "cloud",
};

/** Circumference of the ring's r=80 circle (design/mockups/index.html:251). */
const RING_C = 2 * Math.PI * 80;
/** Gap between the solar and the grid segment of the ring. */
const RING_GAP = 8;

const kw = (w: number): string => formatNumber(Math.max(0, w) / 1000, 1);

export interface EnergyShares {
  /** Consumption covered by the house's own solar production (W). */
  solarUsedW: number;
  /** Consumption drawn from the grid (W). */
  gridW: number;
  /** Production fed into the grid (W). */
  feedInW: number;
}

/** Splits consumption into own solar and grid draw; the surplus is fed in. */
export function energyShares(solar: Solar): EnergyShares {
  const production = Math.max(0, solar.production_w);
  const consumption = Math.max(0, solar.consumption_w);
  return {
    solarUsedW: Math.min(production, consumption),
    gridW: solar.balance_w < 0 ? -solar.balance_w : 0,
    feedInW: solar.balance_w > 0 ? solar.balance_w : 0,
  };
}

function EnergyRing({ solar }: { solar: Solar }) {
  const { solarUsedW, gridW, feedInW } = energyShares(solar);
  const consumption = Math.max(0, solar.consumption_w);
  const solarFrac = consumption > 0 ? solarUsedW / consumption : 0;
  const gridFrac = consumption > 0 ? Math.min(1, gridW / consumption) : 0;
  const bothShown = solarFrac > 0 && gridFrac > 0;
  const solarLen = Math.max(0, solarFrac * RING_C - (bothShown ? RING_GAP : 0));
  const gridLen = Math.max(0, gridFrac * RING_C - (bothShown ? RING_GAP : 0));
  const gridOffset = -(solarFrac * RING_C);

  const balanceLabel = feedInW > 0 ? "Einspeisung" : "Netzbezug";
  const balanceW = feedInW > 0 ? feedInW : gridW;
  const ariaLabel =
    feedInW > 0
      ? `Verbrauch ${kw(consumption)} kW, vollständig aus Solar, ${kw(feedInW)} kW Einspeisung`
      : `Verbrauch ${kw(consumption)} kW, davon ${kw(solarUsedW)} kW Solar und ${kw(gridW)} kW Netzbezug`;

  return (
    <section className="side-block" data-od-id="energy-ring" aria-label="Energie">
      <p className="label">Energie</p>
      <div className="row" style={{ gap: "var(--s-4)", flexWrap: "nowrap", alignItems: "center" }}>
        <div className="ring" style={{ width: 160, height: 160, margin: 0, flex: "none" }} role="img" aria-label={ariaLabel}>
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle className="track" cx="100" cy="100" r="80" />
            <circle
              className="seg-solar"
              cx="100"
              cy="100"
              r="80"
              strokeDasharray={`${solarLen.toFixed(1)} ${RING_C.toFixed(2)}`}
            />
            <circle
              className="seg-grid"
              cx="100"
              cy="100"
              r="80"
              strokeDasharray={`${gridLen.toFixed(1)} ${RING_C.toFixed(2)}`}
              strokeDashoffset={gridOffset.toFixed(1)}
            />
          </svg>
          <div className="ring__center">
            <span className="figure num" style={{ fontSize: 32 }}>
              <span key={kw(consumption)} className="tick">
                {kw(consumption)}
              </span>
            </span>
            <span className="label" style={{ color: "var(--ink-2)" }}>
              kW
            </span>
          </div>
        </div>
        <div className="legend" style={{ flex: 1, minWidth: 0 }}>
          <p className="legend__item" style={{ "--c": "var(--ink)" } as CSSProperties} data-energy="verbrauch">
            Verbrauch<b className="num">{kw(consumption)} kW</b>
          </p>
          <p className="legend__item" style={{ "--c": "var(--accent)" } as CSSProperties} data-energy="solar">
            Solar<b className="num">{kw(solar.production_w)} kW</b>
          </p>
          <p className="legend__item" style={{ "--c": "var(--ink-2)" } as CSSProperties} data-energy="bilanz">
            {balanceLabel}
            <b className="num">{kw(balanceW)} kW</b>
          </p>
        </div>
      </div>
    </section>
  );
}

export interface OutdoorPanelProps {
  outdoor: Outdoor;
  solar: Solar;
}

/** The side blocks `outdoor-weather` and `energy-ring` (design/mockups/index.html:230-265). */
export function OutdoorPanel({ outdoor, solar }: OutdoorPanelProps) {
  const weather = WEATHER_LABELS[outdoor.weather] ?? outdoor.weather;
  const daylightPct = Math.round(Math.min(1, Math.max(0, outdoor.daylight)) * 100);
  return (
    <>
      <section className="side-block" data-od-id="outdoor-weather" aria-label="Außenwetter">
        <p className="label">Außen</p>
        <div className="row" style={{ gap: "var(--s-3)", alignItems: "flex-end" }}>
          <Figure value={outdoor.temperature_c} decimals={1} unit="°C" />
          <p className="lead row" style={{ gap: "var(--s-1)" }} data-weather={outdoor.weather}>
            <Icon name={WEATHER_ICONS[outdoor.weather] ?? "cloud"} />
            {weather}
          </p>
        </div>
        <p className="small muted row" style={{ gap: "6px" }}>
          <Icon name="sunrise" />
          {outdoor.sun_up ? `Sonne steht am Himmel · Tageslicht ${daylightPct} %` : "Sonne untergegangen"}
        </p>
      </section>
      <EnergyRing solar={solar} />
    </>
  );
}

export default OutdoorPanel;
