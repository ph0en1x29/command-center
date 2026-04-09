import {
  Maximize,
  Columns,
  Rows,
  Grid2X2,
  Move,
  LayoutGrid,
  PanelRight,
  PanelRightClose,
  Radio,
} from "lucide-react";
import { useSessionStore } from "../store/sessions";

const LAYOUTS = [
  { id: "focus", label: "Focus", icon: Maximize, description: "Single terminal (⌘1)" },
  { id: "split", label: "Split", icon: Columns, description: "Side by side (⌘2)" },
  { id: "vsplit", label: "Stack", icon: Rows, description: "Top / bottom (⌘3)" },
  { id: "grid", label: "Grid", icon: Grid2X2, description: "2×2 grid (⌘4)" },
  { id: "free", label: "Free", icon: Move, description: "Drag & resize anywhere (⌘5)" },
  { id: "monitor", label: "Monitor", icon: LayoutGrid, description: "All sessions (⌘6)" },
];

interface LayoutBarProps {
  overviewVisible: boolean;
  onToggleOverview: () => void;
}

export function LayoutBar({ overviewVisible, onToggleOverview }: LayoutBarProps) {
  const {
    layoutMode,
    setLayoutMode,
    sessions,
    focusedSessionIds,
    broadcastMode,
    setBroadcastMode,
  } = useSessionStore();

  const toggleBroadcast = () => {
    if (broadcastMode) {
      setBroadcastMode(false);
    } else {
      // Snapshot currently visible / focused sessions as broadcast targets
      const targets =
        focusedSessionIds.size > 0
          ? Array.from(focusedSessionIds)
          : Array.from(sessions.keys());
      setBroadcastMode(true, targets);
    }
  };

  return (
    <div className="h-9 px-3 flex items-center justify-between bg-surface-1 border-b border-border">
      {/* Left: layout modes */}
      <div className="flex items-center gap-0.5">
        {LAYOUTS.map((layout) => {
          const Icon = layout.icon;
          const isActive = layoutMode === layout.id;
          return (
            <button
              key={layout.id}
              onClick={() => setLayoutMode(layout.id)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-all ${
                isActive
                  ? "bg-accent/15 text-accent font-medium"
                  : "text-white/35 hover:text-white/60 hover:bg-white/[0.03]"
              }`}
              title={layout.description}
            >
              <Icon size={13} />
              <span>{layout.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: broadcast + info + overview toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleBroadcast}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-all ${
            broadcastMode
              ? "bg-red-500/20 text-red-400 font-medium ring-1 ring-red-500/40 animate-pulse"
              : "text-white/35 hover:text-white/60 hover:bg-white/[0.03]"
          }`}
          title={
            broadcastMode
              ? `BROADCAST MODE — keystrokes mirror to ${
                  useSessionStore.getState().broadcastTargets.size
                } panels. Click to disable. (⌘⇧B)`
              : "Broadcast: send keystrokes to all visible panels at once (⌘⇧B). Useful for running the same command on multiple servers."
          }
        >
          <Radio size={12} />
          <span>{broadcastMode ? "BROADCASTING" : "Broadcast"}</span>
        </button>
        <span
          className="text-[10px] text-white/20"
          title="Number of sessions visible in the current layout / total open sessions"
        >
          {focusedSessionIds.size} of {sessions.size} visible
        </span>
        <button
          onClick={onToggleOverview}
          className={`p-1 rounded transition-colors ${
            overviewVisible
              ? "text-accent bg-accent/10"
              : "text-white/30 hover:text-white/50 hover:bg-white/5"
          }`}
          title="Toggle overview panel (⌘⇧O)"
        >
          {overviewVisible ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
        </button>
      </div>
    </div>
  );
}
