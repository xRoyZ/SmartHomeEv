import type { SimState } from "../../types";

export interface AppHeaderProps {
  state: SimState | null;
  connected: boolean;
}

/**
 * The site header (brand, "Simulation" tag, navigation, clock chip, alert badge
 * — design/mockups/index.html site-header). Built by the UI kit ticket; until
 * then it renders nothing.
 */
export function AppHeader(_props: AppHeaderProps) {
  return null;
}

export default AppHeader;
