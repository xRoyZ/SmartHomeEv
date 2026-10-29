import { Outlet } from "react-router-dom";
import { AppHeader } from "../components/chrome/AppHeader";
import { useSimState } from "../state/SimStateProvider";

/** The frame of every route: header, connection notice, the page. */
export function AppFrame() {
  const { state, connected } = useSimState();

  return (
    <div className="app-frame" data-testid="app-frame">
      <AppHeader state={state} connected={connected} />
      {!connected && (
        <div className="page-pad">
          <p className="banner-error connection-notice" role="status" data-testid="connection-notice">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="icon"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              {/* lucide/wifi-off */}
              <path d="M12 20h.01M8.5 16.429a5 5 0 0 1 7 0M5 12.859a10 10 0 0 1 5.17-2.69m8.83 2.69a10 10 0 0 0-2.007-1.523M2 8.82a15 15 0 0 1 4.177-2.643M22 8.82a15 15 0 0 0-11.288-3.764M2 2l20 20" />
            </svg>
            <span>
              {state === null
                ? "Verbindung zur Simulation wird hergestellt …"
                : "Verbindung zur Simulation unterbrochen – die angezeigten Werte sind nicht aktuell. Neuer Versuch läuft automatisch."}
            </span>
          </p>
        </div>
      )}
      <Outlet />
    </div>
  );
}

export default AppFrame;
