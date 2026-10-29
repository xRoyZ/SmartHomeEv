import { Link, useLocation } from "react-router-dom";

export interface NavItem {
  to: string;
  label: string;
  /** Whether the item is the current page for a pathname. */
  isCurrent: (pathname: string) => boolean;
}

/**
 * The main navigation of design/mockups/*.html (`.nav`, "Hauptnavigation").
 * "Übersicht" stays current on a room page (design/mockups/raum.html:18): the
 * rooms are reached from the overview's house plan.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Übersicht", isCurrent: (p) => p === "/" || p.startsWith("/raum/") },
  { to: "/verlauf", label: "Verlauf", isCurrent: (p) => p === "/verlauf" },
  { to: "/automationen", label: "Automationen", isCurrent: (p) => p === "/automationen" },
  { to: "/warnungen", label: "Alarme", isCurrent: (p) => p === "/warnungen" },
  { to: "/einstellungen", label: "Simulation", isCurrent: (p) => p === "/einstellungen" },
];

export interface MainNavProps {
  /** Overrides the router's pathname (gallery, tests). */
  pathname?: string;
}

/**
 * Links to every page. On a phone (≤720px, design/mockups/styles.css
 * responsive block) the nav takes its own full-width row under brand and
 * badge and wraps its 44px pills, so nothing scrolls sideways at 390px.
 */
export function MainNav({ pathname }: MainNavProps) {
  const location = useLocation();
  const current = pathname ?? location.pathname;
  return (
    <nav className="nav" aria-label="Hauptnavigation">
      {NAV_ITEMS.map((item) => (
        <Link key={item.to} to={item.to} aria-current={item.isCurrent(current) ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export default MainNav;
