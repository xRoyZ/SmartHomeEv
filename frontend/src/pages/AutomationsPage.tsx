import { useState } from "react";
import { ActivityLog } from "../components/automations/ActivityLog";
import { AutomationEditor } from "../components/automations/AutomationEditor";
import { AutomationList } from "../components/automations/AutomationList";
import { useSimState } from "../state/SimStateProvider";
import { Grid, PageHead } from "../ui";

/** "Automationen" (design/mockups/automationen.html): rules, rule editor and activity log. */
export function AutomationsPage() {
  const { state } = useSimState();
  const [editingId, setEditingId] = useState<number | null>(null);
  // Bumped by "Neue Automation" so the editor starts over with a fresh rule.
  const [session, setSession] = useState(0);

  const automations = state?.automations ?? null;
  const devices = state?.devices ?? [];
  const rooms = state?.rooms ?? [];
  // A rule deleted meanwhile (here or on another client) leaves the editor.
  const editing = editingId === null ? null : (automations?.find((a) => a.id === editingId) ?? null);
  const editorKey = editing ? `edit-${editing.id}` : `new-${session}`;

  return (
    <main className="page" data-page="automations">
      <div className="page-pad">
        <div data-od-id="automations-head">
          <PageHead
            title="Das Haus handelt, wenn du es sagst"
            intro="Jede Regel verbindet eine Bedingung mit einer Aktion. Sobald die Bedingung stimmt, schaltet das Haus selbst und trägt es im Aktivitätsprotokoll ein."
          />
        </div>

        <Grid split style={{ paddingTop: "var(--s-5)" }}>
          <AutomationList
            automations={automations}
            devices={devices}
            rooms={rooms}
            editingId={editing?.id ?? null}
            onNew={() => {
              setEditingId(null);
              setSession((s) => s + 1);
            }}
            onEdit={(a) => setEditingId(a.id)}
            onDeleted={(id) => {
              if (id === editingId) setEditingId(null);
            }}
          />
          <AutomationEditor key={editorKey} automation={editing} devices={devices} rooms={rooms} ready={state !== null} />
          <ActivityLog entries={state?.activity ?? null} now={state?.clock.sim_time ?? null} />
        </Grid>
        <div style={{ height: "var(--s-6)" }} />
      </div>
    </main>
  );
}

export default AutomationsPage;
