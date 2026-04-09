import { useEffect, useMemo, useRef, useState } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import { TerminalPanel } from "./TerminalPanel";
import type { SessionInfo } from "../types";

const SizedGridLayout = WidthProvider(GridLayout);
const STORAGE_KEY = "cc:free-layout";

type SavedItem = { x: number; y: number; w: number; h: number };
type SavedMap = Record<string, SavedItem>;

function loadSaved(): SavedMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function persist(map: SavedMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

interface FreeLayoutProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  setActiveSession: (id: string) => void;
  registerWriter: (id: string, writer: (data: string) => void) => void;
  unregisterWriter: (id: string) => void;
}

export function FreeLayout({
  sessions,
  activeSessionId,
  setActiveSession,
  registerWriter,
  unregisterWriter,
}: FreeLayoutProps) {
  const [savedMap, setSavedMap] = useState<SavedMap>(() => loadSaved());
  const containerRef = useRef<HTMLDivElement>(null);

  // Build the layout array. Saved positions take priority; new sessions
  // get auto-placed by stacking from y=Infinity (RGL pushes to bottom).
  const layout: Layout[] = useMemo(() => {
    return sessions.map((s, i) => {
      const saved = savedMap[s.id];
      if (saved) {
        return { i: s.id, ...saved, minW: 3, minH: 4 };
      }
      // Default: tile across cols 0/6 in rows of 2
      const col = (i * 6) % 12;
      const row = Math.floor((i * 6) / 12) * 8;
      return { i: s.id, x: col, y: row, w: 6, h: 8, minW: 3, minH: 4 };
    });
  }, [sessions, savedMap]);

  // Persist whenever the user finishes a drag/resize
  const handleLayoutChange = (next: Layout[]) => {
    setSavedMap((prev) => {
      const updated: SavedMap = { ...prev };
      next.forEach((l) => {
        updated[l.i] = { x: l.x, y: l.y, w: l.w, h: l.h };
      });
      persist(updated);
      return updated;
    });
  };

  // Garbage-collect saved entries for sessions that no longer exist
  useEffect(() => {
    const live = new Set(sessions.map((s) => s.id));
    setSavedMap((prev) => {
      const next: SavedMap = {};
      let dirty = false;
      for (const [id, val] of Object.entries(prev)) {
        if (live.has(id)) next[id] = val;
        else dirty = true;
      }
      if (dirty) persist(next);
      return dirty ? next : prev;
    });
  }, [sessions]);

  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-0">
        <p className="text-white/20 text-sm">No sessions to display</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 bg-surface-0 min-h-0 overflow-auto">
      <SizedGridLayout
        className="layout"
        layout={layout}
        cols={12}
        rowHeight={32}
        margin={[6, 6]}
        containerPadding={[6, 6]}
        compactType={null}
        preventCollision={false}
        allowOverlap={false}
        draggableHandle=".session-drag-handle"
        resizeHandles={["se"]}
        onLayoutChange={handleLayoutChange}
        useCSSTransforms={true}
      >
        {sessions.map((s) => (
          <div key={s.id} className="overflow-hidden">
            <TerminalPanel
              session={s}
              isActive={activeSessionId === s.id}
              compact={true}
              onFocus={() => setActiveSession(s.id)}
              registerWriter={registerWriter}
              unregisterWriter={unregisterWriter}
            />
          </div>
        ))}
      </SizedGridLayout>
    </div>
  );
}
