import type { ReactElement } from "react";

/** Icon shapes of the mockup set (lucide, as inlined in design/mockups/*.html). */
const SHAPES = {
  "activity": <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />,
  "arrow-left": <path d="m12 19l-7-7l7-7m7 7H5" />,
  "bell-ring": <path d="M10.268 21a2 2 0 0 0 3.464 0M22 8c0-2.3-.8-4.3-2-6M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326M4 2C2.8 3.7 2 5.7 2 8" />,
  "blinds": <><path d="M3 3h18m-1 4H8m12 4H8m2 8h10M8 15h12M4 3v14" /><circle cx="4" cy="19" r="2" /></>,
  "check": <path d="M20 6L9 17l-5-5" />,
  "chevron-down": <path d="m6 9l6 6l6-6" />,
  "circle-alert": <><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></>,
  "circle-check": <><circle cx="12" cy="12" r="10" /><path d="m16 9l-5.5 5.5L8 12" /></>,
  "clock": <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  "cloud": <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9" />,
  "door-closed": <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16m-3 0h20M9 12h.01" />,
  "door-open": <><path d="M10 21H2m8-18H7a2 2 0 0 0-2 2v16m9-9h.01" /><path d="M19 21V5a2 2 0 0 0-1.675-1.974l-6.163-1.013A1 1 0 0 0 10 3v18a1 1 0 0 0 1.124.992zm3 0h-3" /></>,
  "droplets": <><path d="M7 16.3c2.2 0 4-1.83 4-4.05c0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05" /><path d="M12.56 6.6A11 11 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" /></>,
  "flame": <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0a5 5 0 0 1 1-3a1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" />,
  "heater": <><path d="M11 8c2-3-2-3 0-6m4.5 6c2-3-2-3 0-6M6 10h.01M6 14h.01M10 16v-4m4 4v-4m4 4v-4" /><path d="M20 6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3M5 20v2m14-2v2" /></>,
  "lamp-floor": <path d="M12 10v12m5.929-14.371A1 1 0 0 1 17 9H7a1 1 0 0 1-.928-1.371l2-5A1 1 0 0 1 9 2h6a1 1 0 0 1 .928.629zM9 22h6" />,
  "leaf": <><path d="M11 20a10 10 0 0 0 10-10a25.9 25.9 0 0 0-1.04-7.281a1 1 0 0 0-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0 0 11 20" /><path d="M2 21a5 5 0 0 1 2.911-4.544C7.613 15.212 8.351 15.24 11 13" /></>,
  "lightbulb": <path d="M15 14c.2-1 .7-1.7 1.5-2.5c1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5c.7.7 1.3 1.5 1.5 2.5m0 4h6m-5 4h4" />,
  "lightbulb-off": <path d="M16.8 11.2c.8-.9 1.2-2 1.2-3.2a6 6 0 0 0-9.3-5M2 2l20 20M6.3 6.3a4.67 4.67 0 0 0 1.2 5.2c.7.7 1.3 1.5 1.5 2.5m0 4h6m-5 4h4" />,
  "lock": <><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  "minus": <path d="M5 12h14" />,
  "pause": <><rect width="5" height="18" x="14" y="3" rx="1" /><rect width="5" height="18" x="5" y="3" rx="1" /></>,
  "pencil": <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4" />,
  "play": <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />,
  "plug": <path d="M12 22v-5m3-9V2m2 6a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1zM9 8V2" />,
  "plus": <path d="M5 12h14m-7-7v14" />,
  "radio": <><path d="M16.247 7.761a6 6 0 0 1 0 8.478m2.828-11.306a10 10 0 0 1 0 14.134m-14.15 0a10 10 0 0 1 0-14.134m2.828 11.306a6 6 0 0 1 0-8.478" /><circle cx="12" cy="12" r="2" /></>,
  "rotate-ccw": <><path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>,
  "sun": <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>,
  "sunrise": <path d="M12 2v8m-7.07.93l1.41 1.41M2 18h2m16 0h2m-2.93-7.07l-1.41 1.41M22 22H2M8 6l4-4l4 4m0 12a4 4 0 0 0-8 0" />,
  "thermometer": <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />,
  "thermometer-snowflake": <><path d="m10 20l-1.25-2.5L6 18m4-14L8.75 6.5L6 6m4.585 9H10m-8-3h6.5L10 9m10 5.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z" /><path d="m4 10l1.5 2L4 14m3 7l3-6l-1.5-3M7 3l3 6h2" /></>,
  "trash-2": <path d="M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
  "triangle-alert": <path d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01" />,
  "tv": <><path d="m17 2l-5 5l-5-5" /><rect width="20" height="15" x="2" y="7" rx="2" /></>,
  "wifi": <path d="M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.859a10 10 0 0 1 14 0M8.5 16.429a5 5 0 0 1 7 0" />,
  "wifi-off": <path d="M12 20h.01M8.5 16.429a5 5 0 0 1 7 0M5 12.859a10 10 0 0 1 5.17-2.69m8.83 2.69a10 10 0 0 0-2.007-1.523M2 8.82a15 15 0 0 1 4.177-2.643M22 8.82a15 15 0 0 0-11.288-3.764M2 2l20 20" />,
  "wind": <path d="M12.8 19.6A2 2 0 1 0 14 16H2m15.5-8a2.5 2.5 0 1 1 2 4H2m7.8-7.6A2 2 0 1 1 11 8H2" />,
  "zap": <path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z" />,
} satisfies Record<string, ReactElement>;
export type IconName = keyof typeof SHAPES;

export interface IconProps {
  name: IconName;
  className?: string;
  /** Accessible name; without it the icon is decorative (aria-hidden). */
  label?: string;
}

/** One inline SVG icon with the design's `.icon` class (20px, currentColor). */
export function Icon({ name, className, label }: IconProps) {
  const cls = className ? `icon ${className}` : "icon";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={cls}
      data-icon={`lucide/${name}`}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
        {SHAPES[name]}
      </g>
    </svg>
  );
}

export default Icon;
