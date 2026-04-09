import { AlertTriangle, Terminal, X } from "lucide-react";
import { StatusDot } from "./StatusDot";
import { STATUS_LABELS, sessionHostLabel, type SessionInfo } from "../types";

interface CloseSessionModalProps {
  session: SessionInfo;
  onConfirm: () => void;
  onCancel: () => void;
}

const ACTIVE_STATUSES = new Set(["Thinking", "Writing", "RunningCommand"]);

export function CloseSessionModal({ session, onConfirm, onCancel }: CloseSessionModalProps) {
  const isActive = ACTIVE_STATUSES.has(session.status);
  const isConnected = session.status !== "Disconnected";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-[400px] bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 flex items-center gap-3 border-b ${
            isActive
              ? "border-amber-500/30 bg-amber-500/10"
              : "border-border"
          }`}
        >
          {isActive ? (
            <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          ) : (
            <Terminal size={18} className="text-white/40 shrink-0" />
          )}
          <div>
            <h2 className="text-sm font-semibold text-white/90">
              {isActive ? "Session is actively running" : "Close session?"}
            </h2>
            {isActive && (
              <p className="text-[11px] text-amber-300/70 mt-0.5">
                Claude Code appears to be {STATUS_LABELS[session.status].toLowerCase()} in this session.
                Closing will terminate the process immediately.
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-1 rounded-lg border border-border">
            <StatusDot status={session.status} size="md" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-white/80 truncate">
                {session.config.name}
              </p>
              <p className="text-[11px] text-white/40 font-mono truncate">
                {sessionHostLabel(session.config)}
              </p>
            </div>
            <span
              className="ml-auto shrink-0 px-2 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: isActive
                  ? "rgba(245,158,11,0.15)"
                  : isConnected
                  ? "rgba(34,197,94,0.1)"
                  : "rgba(107,114,128,0.1)",
                color: isActive ? "#f59e0b" : isConnected ? "#22c55e" : "#6b7280",
              }}
            >
              {STATUS_LABELS[session.status]}
            </span>
          </div>

          {session.current_task && (
            <div className="px-3 py-2 bg-surface-0 border border-border rounded-lg">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
                Current task
              </p>
              <p className="text-[12px] text-white/70 font-mono truncate">
                {session.current_task}
              </p>
            </div>
          )}

          {isActive && (
            <p className="text-[11px] text-white/50 leading-relaxed">
              If this session has <span className="font-mono text-white/70">wrap_in_tmux</span>{" "}
              enabled, the remote process will continue running and you can reattach later.
              Otherwise, closing will kill the remote process.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-end gap-2 border-t border-border bg-surface-1/50">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
              isActive
                ? "bg-amber-500/90 text-white hover:bg-amber-400 shadow-md shadow-amber-500/20"
                : "bg-red-500/80 text-white hover:bg-red-400 shadow-md shadow-red-500/20"
            }`}
          >
            {isActive ? "Close anyway" : "Close session"}
          </button>
        </div>
      </div>
    </div>
  );
}
