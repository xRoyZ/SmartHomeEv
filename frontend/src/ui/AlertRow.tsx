import type { ReactNode } from "react";
import type { AlertKind } from "../types";
import { Button, cx } from "./Button";
import { Icon, type IconName } from "./Icon";

/** The icon the design gives each alert kind (design/mockups/alarme.html). */
export const ALERT_KIND_ICONS: Record<AlertKind, IconName> = {
  zu_kalt: "thermometer-snowflake",
  zu_warm: "thermometer",
  co2_hoch: "wind",
  rauch: "flame",
  wasser: "droplets",
  verbrauch_hoch: "zap",
  fenster_heizung: "door-open",
  heizungsausfall: "heater",
};

export interface AlertListProps {
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
}

/** The design's `.alert-list`. */
export function AlertList({ children, className, ...aria }: AlertListProps) {
  return (
    <div className={cx("alert-list", className)} {...aria}>
      {children}
    </div>
  );
}

export interface AlertRowProps {
  /** Headline, e.g. "CO2 1.420 ppm – Kinderzimmer". Rendered as text. */
  title: ReactNode;
  /** Meta line, e.g. "seit Mi 07:21". */
  meta?: ReactNode;
  /** Icon from the alert kind ... */
  kind?: AlertKind;
  /** ... or an explicit icon (default triangle-alert). */
  icon?: IconName;
  /** alert-row--lg: the large rows of the alerts page. */
  large?: boolean;
  /** is-new: pulses once to draw the eye to a freshly raised alert. */
  isNew?: boolean;
  /** is-ack: acknowledged, quiet outline and the ack-note instead of the button. */
  acknowledged?: boolean;
  /** Text of the ack-note (default "Bestätigt"). */
  ackNote?: ReactNode;
  /** Acknowledge callback; without it no button is shown. */
  onAcknowledge?: () => void;
  /** Accent button instead of the outline one (the first alert of a list). */
  ackPrimary?: boolean;
  /** While the acknowledgement is on its way. */
  ackPending?: boolean;
  /** Heading level of the title on the alerts page (h3); a `p` otherwise. */
  titleAs?: "p" | "h3";
  as?: "div" | "article";
}

/** The design's `.alert-row`: icon, title, meta, "Bestätigen" or the ack-note. */
export function AlertRow({
  title,
  meta,
  kind,
  icon,
  large = false,
  isNew = false,
  acknowledged = false,
  ackNote = "Bestätigt",
  onAcknowledge,
  ackPrimary = false,
  ackPending = false,
  titleAs = "p",
  as = "div",
}: AlertRowProps) {
  const Tag = as;
  const TitleTag = titleAs;
  const iconName: IconName = icon ?? (kind ? ALERT_KIND_ICONS[kind] : "triangle-alert");
  return (
    <Tag
      className={cx("alert-row", large && "alert-row--lg", isNew && !acknowledged && "is-new", acknowledged && "is-ack")}
      data-acknowledged={acknowledged ? "true" : "false"}
    >
      <Icon name={iconName} />
      <div>
        <TitleTag className="alert-row__title">{title}</TitleTag>
        {meta !== undefined && <p className="alert-row__meta num">{meta}</p>}
      </div>
      {!acknowledged && onAcknowledge && (
        <Button
          variant={ackPrimary ? "primary" : "secondary"}
          size={large ? "md" : "sm"}
          onClick={onAcknowledge}
          disabled={ackPending}
          data-ack=""
        >
          {ackPending ? "Wird bestätigt …" : "Bestätigen"}
        </Button>
      )}
      <span className="ack-note">
        <Icon name="check" />
        <span>{ackNote}</span>
      </span>
    </Tag>
  );
}

export default AlertRow;
