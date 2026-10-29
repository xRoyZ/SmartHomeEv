import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AppFrame } from "./layout/AppFrame";
import { AlertsPage } from "./pages/AlertsPage";
import { AutomationsPage } from "./pages/AutomationsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { OverviewPage } from "./pages/OverviewPage";
import { RoomPage } from "./pages/RoomPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SimStateProvider } from "./state/SimStateProvider";

// The gallery exists only in development: in a production build
// import.meta.env.DEV is false, so the route and its chunk are dropped.
const Gallery = import.meta.env.DEV ? lazy(() => import("./dev/Gallery")) : null;

function NotFoundPage() {
  return (
    <main className="page" data-page="not-found">
      <div className="page-pad">
        <section className="page-head">
          <h1 className="page-title">Diese Seite gibt es nicht</h1>
          <p className="page-intro">
            <Link className="link" to="/">
              Zur Übersicht
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

/** The route table, every route inside AppFrame. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppFrame />}>
        <Route index element={<OverviewPage />} />
        <Route path="raum/:roomId" element={<RoomPage />} />
        <Route path="automationen" element={<AutomationsPage />} />
        <Route path="alarme" element={<AlertsPage />} />
        <Route path="verlauf" element={<HistoryPage />} />
        <Route path="simulation" element={<SettingsPage />} />
        {/* The earlier paths of these two screens stay reachable as redirects. */}
        <Route path="warnungen" element={<Navigate to="/alarme" replace />} />
        <Route path="einstellungen" element={<Navigate to="/simulation" replace />} />
        {Gallery && (
          <Route
            path="dev/galerie"
            element={
              <Suspense fallback={null}>
                <Gallery />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <SimStateProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SimStateProvider>
  );
}
