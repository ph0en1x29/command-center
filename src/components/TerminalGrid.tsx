import { useMemo } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { useSessionStore } from "../store/sessions";
import { TerminalPanel } from "./TerminalPanel";
import { FreeLayout } from "./FreeLayout";
import type { SessionInfo } from "../types";

interface TerminalGridProps {
  outputHandlers: React.MutableRefObject<Map<string, (data: string) => void>>;
}

type Writer = (data: string) => void;

/**
 * Slim dividers — visually 1px, but hitAreaMargins extends the invisible
 * grab target ~10px on each side so they're easy to drag.
 */
const HIT = { coarse: 16, fine: 10 };

function VHandle() {
  return (
    <PanelResizeHandle
      hitAreaMargins={HIT}
      className="group relative w-1.5 mx-0.5 flex items-center justify-center cursor-col-resize"
    >
      <div className="w-px h-full bg-border group-hover:bg-accent/60 group-data-[resize-handle-state=drag]:bg-accent group-data-[resize-handle-state=drag]:w-0.5 transition-all" />
    </PanelResizeHandle>
  );
}
function HHandle() {
  return (
    <PanelResizeHandle
      hitAreaMargins={HIT}
      className="group relative h-1.5 my-0.5 flex items-center justify-center cursor-row-resize"
    >
      <div className="h-px w-full bg-border group-hover:bg-accent/60 group-data-[resize-handle-state=drag]:bg-accent group-data-[resize-handle-state=drag]:h-0.5 transition-all" />
    </PanelResizeHandle>
  );
}

export function TerminalGrid({ outputHandlers }: TerminalGridProps) {
  const { sessions, activeSessionId, focusedSessionIds, layoutMode, setActiveSession } =
    useSessionStore();

  const register = (id: string, writer: Writer) => {
    outputHandlers.current.set(id, writer);
  };
  const unregister = (id: string) => {
    outputHandlers.current.delete(id);
  };

  const visibleSessions = useMemo<SessionInfo[]>(() => {
    const all = Array.from(sessions.values());

    if (layoutMode === "focus") {
      const active = all.find((s) => s.id === activeSessionId);
      return active ? [active] : all.slice(0, 1);
    }
    if (layoutMode === "split" || layoutMode === "vsplit") {
      const focused = all.filter((s) => focusedSessionIds.has(s.id));
      return focused.length > 0 ? focused.slice(0, 2) : all.slice(0, 2);
    }
    if (layoutMode === "grid") {
      const focused = all.filter((s) => focusedSessionIds.has(s.id));
      return focused.length > 0 ? focused.slice(0, 4) : all.slice(0, 4);
    }
    if (layoutMode === "free") {
      return all.filter((s) => focusedSessionIds.has(s.id));
    }
    return all; // monitor
  }, [sessions, activeSessionId, focusedSessionIds, layoutMode]);

  if (visibleSessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-0">
        <div className="text-center">
          <p className="text-white/20 text-sm">No sessions to display</p>
          <p className="text-white/10 text-xs mt-1">
            Create a new session or adjust visibility in the sidebar
          </p>
        </div>
      </div>
    );
  }

  const renderPanel = (session: SessionInfo, compact: boolean) => (
    <TerminalPanel
      key={session.id}
      session={session}
      isActive={activeSessionId === session.id}
      compact={compact}
      onFocus={() => setActiveSession(session.id)}
      registerWriter={register}
      unregisterWriter={unregister}
    />
  );

  // ── Free: full drag/resize/move with react-grid-layout ────────────────
  if (layoutMode === "free") {
    return (
      <FreeLayout
        sessions={visibleSessions}
        activeSessionId={activeSessionId}
        setActiveSession={setActiveSession}
        registerWriter={register}
        unregisterWriter={unregister}
      />
    );
  }

  // ── Focus: single full-bleed panel. Only the active session is rendered.
  //    On switch, the old panel unmounts and the new one mounts fresh —
  //    TerminalPanel reloads the tail of the transcript so previous output
  //    is visible immediately. No WebGL = no context-loss blanking. ──────
  if (layoutMode === "focus" || visibleSessions.length === 1) {
    return (
      <div className="flex-1 p-1.5 bg-surface-0 min-h-0">
        {renderPanel(visibleSessions[0], false)}
      </div>
    );
  }

  // ── Split (side-by-side) ──────────────────────────────────────────────
  if (layoutMode === "split" || (layoutMode !== "vsplit" && visibleSessions.length === 2)) {
    return (
      <div className="flex-1 p-1.5 bg-surface-0 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId="cc:split" className="h-full">
          <Panel defaultSize={50} minSize={15}>
            {renderPanel(visibleSessions[0], false)}
          </Panel>
          <VHandle />
          <Panel defaultSize={50} minSize={15}>
            {renderPanel(visibleSessions[1], false)}
          </Panel>
        </PanelGroup>
      </div>
    );
  }

  // ── VSplit (top/bottom) ───────────────────────────────────────────────
  if (layoutMode === "vsplit") {
    return (
      <div className="flex-1 p-1.5 bg-surface-0 min-h-0">
        <PanelGroup direction="vertical" autoSaveId="cc:vsplit" className="h-full">
          <Panel defaultSize={50} minSize={15}>
            {renderPanel(visibleSessions[0], false)}
          </Panel>
          <HHandle />
          <Panel defaultSize={50} minSize={15}>
            {renderPanel(visibleSessions[1], false)}
          </Panel>
        </PanelGroup>
      </div>
    );
  }

  // ── Grid (2×2): vertical group of two horizontal groups ───────────────
  if (layoutMode === "grid") {
    const [a, b, c, d] = visibleSessions;
    return (
      <div className="flex-1 p-1.5 bg-surface-0 min-h-0">
        <PanelGroup
          direction="vertical"
          autoSaveId="cc:grid:rows"
          className="h-full"
        >
          <Panel defaultSize={50} minSize={15}>
            <PanelGroup
              direction="horizontal"
              autoSaveId="cc:grid:row1"
              className="h-full"
            >
              <Panel defaultSize={50} minSize={15}>
                {a && renderPanel(a, true)}
              </Panel>
              {b && (
                <>
                  <VHandle />
                  <Panel defaultSize={50} minSize={15}>
                    {renderPanel(b, true)}
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
          {(c || d) && (
            <>
              <HHandle />
              <Panel defaultSize={50} minSize={15}>
                <PanelGroup
                  direction="horizontal"
                  autoSaveId="cc:grid:row2"
                  className="h-full"
                >
                  {c && (
                    <Panel defaultSize={50} minSize={15}>
                      {renderPanel(c, true)}
                    </Panel>
                  )}
                  {c && d && <VHandle />}
                  {d && (
                    <Panel defaultSize={50} minSize={15}>
                      {renderPanel(d, true)}
                    </Panel>
                  )}
                </PanelGroup>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    );
  }

  // ── Monitor: auto-fit CSS grid (no manual resizing) ───────────────────
  const count = visibleSessions.length;
  const monitorClass =
    count <= 2
      ? "grid-cols-2 grid-rows-1"
      : count <= 4
      ? "grid-cols-2 grid-rows-2"
      : count <= 6
      ? "grid-cols-3 grid-rows-2"
      : "grid-cols-3 grid-rows-3";

  return (
    <div className={`flex-1 grid ${monitorClass} gap-1.5 p-1.5 bg-surface-0 min-h-0`}>
      {visibleSessions.map((session) => renderPanel(session, visibleSessions.length > 2))}
    </div>
  );
}
