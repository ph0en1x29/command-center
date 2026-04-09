import { useMemo } from "react";
import {
  Activity,
  Server,
  Terminal as TerminalIcon,
  Coffee,
  AlertCircle,
  Clock,
  Radio,
} from "lucide-react";
import { useSessionStore } from "../store/sessions";
import { useTick } from "../hooks/useTick";
import { formatBytes, formatDuration, sessionHostLabel } from "../types";

const LAYOUT_LABELS: Record<string, string> = {
  focus: "Focus",
  split: "Split",
  vsplit: "Stack",
  grid: "Grid 2×2",
  free: "Free",
  monitor: "Monitor",
};

export function StatusBar() {
  const { sessions, activeSessionId, layoutMode, broadcastMode, broadcastTargets } =
    useSessionStore();
  useTick(1000);

  const all = useMemo(() => Array.from(sessions.values()), [sessions]);
  const active = activeSessionId ? sessions.get(activeSessionId) : null;

  const sshCount = all.filter((s) => s.config.kind !== "local").length;
  const localCount = all.filter((s) => s.config.kind === "local").length;
  const connectedCount = all.filter(
    (s) => s.status !== "Disconnected" && s.status !== "Connecting"
  ).length;
  const errorCount = all.filter((s) => s.status === "Error").length;
  const keepAwakeCount = all.filter((s) => s.keep_awake).length;
  const totalRx = all.reduce((sum, s) => sum + (s.bytes_received || 0), 0);
  const totalTx = all.reduce((sum, s) => sum + (s.bytes_sent || 0), 0);

  const now = Date.now();
  const activeUptime =
    active && active.connected_at ? now - new Date(active.connected_at).getTime() : 0;

  const time = new Date(now).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="h-6 px-3 flex items-center justify-between bg-surface-1 border-t border-border text-[10px] font-mono text-white/40 select-none shrink-0">
      {/* Left: session counts */}
      <div className="flex items-center gap-3">
        <span
          className={`flex items-center gap-1 ${
            connectedCount > 0 ? "text-status-connected" : ""
          }`}
          title="Connected sessions / total"
        >
          <Activity size={10} />
          {connectedCount}/{all.length}
        </span>
        {sshCount > 0 && (
          <span className="flex items-center gap-1" title="SSH sessions">
            <Server size={10} />
            {sshCount}
          </span>
        )}
        {localCount > 0 && (
          <span className="flex items-center gap-1" title="Local sessions">
            <TerminalIcon size={10} />
            {localCount}
          </span>
        )}
        {keepAwakeCount > 0 && (
          <span
            className="flex items-center gap-1 text-amber-400/70"
            title={`${keepAwakeCount} session${keepAwakeCount > 1 ? "s" : ""} kept awake`}
          >
            <Coffee size={10} />
            {keepAwakeCount}
          </span>
        )}
        {errorCount > 0 && (
          <span
            className="flex items-center gap-1 text-status-error"
            title={`${errorCount} session${errorCount > 1 ? "s" : ""} in error`}
          >
            <AlertCircle size={10} />
            {errorCount}
          </span>
        )}
      </div>

      {/* Center: active session info */}
      <div className="flex items-center gap-3 min-w-0">
        {active ? (
          <>
            <span className="text-white/70 truncate">{active.config.name}</span>
            <span className="text-white/25 truncate">{sessionHostLabel(active.config)}</span>
            {active.connected_at && (
              <span className="flex items-center gap-1" title="Active session uptime">
                <Clock size={9} />
                {formatDuration(activeUptime)}
              </span>
            )}
          </>
        ) : (
          <span className="text-white/20">no session selected</span>
        )}
      </div>

      {/* Right: layout, traffic, clock */}
      <div className="flex items-center gap-3">
        {broadcastMode && (
          <span
            className="flex items-center gap-1 text-red-400 font-bold animate-pulse"
            title={`Broadcasting keystrokes to ${broadcastTargets.size} panels. Cmd+Shift+B to stop.`}
          >
            <Radio size={10} />
            BCAST {broadcastTargets.size}
          </span>
        )}
        <span title="Layout mode">{LAYOUT_LABELS[layoutMode] || layoutMode}</span>
        <span title="Total bytes received from PTYs">
          ↓{formatBytes(totalRx)}
        </span>
        <span title="Total bytes sent to PTYs">
          ↑{formatBytes(totalTx)}
        </span>
        <span className="text-white/50">{time}</span>
      </div>
    </div>
  );
}
