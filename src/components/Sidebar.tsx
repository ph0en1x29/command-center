import { useState } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Server,
  Clock,
  Eye,
  EyeOff,
  X,
  Terminal as TerminalIcon,
  CheckSquare,
  Square,
  Trash2,
} from "lucide-react";
import { useSessionStore } from "../store/sessions";
import { StatusDot } from "./StatusDot";
import { STATUS_LABELS, sessionHostLabel, tagColor } from "../types";
import { formatDistanceToNow } from "date-fns";

interface SidebarProps {
  onNewSession: () => void;
  onCloseSession: (id: string) => void;
  onQuickLocal?: () => void;
}

export function Sidebar({ onNewSession, onCloseSession, onQuickLocal }: SidebarProps) {
  const {
    sessions,
    activeSessionId,
    focusedSessionIds,
    sidebarOpen,
    setActiveSession,
    toggleFocusedSession,
    toggleSidebar,
  } = useSessionStore();

  const sessionList = Array.from(sessions.values());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(sessionList.map((s) => s.id)));
  };

  const deleteSelected = () => {
    selected.forEach((id) => onCloseSession(id));
    setSelected(new Set());
    setSelectMode(false);
  };

  const exitSelectMode = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  if (!sidebarOpen) {
    return (
      <div className="w-10 bg-surface-1 border-r border-border flex flex-col items-center pt-3 gap-2">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          <ChevronRight size={14} />
        </button>
        {sessionList.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSession(s.id)}
            className={`p-1.5 rounded-md transition-colors ${
              activeSessionId === s.id
                ? "bg-accent/15 text-accent"
                : "text-white/40 hover:text-white/70 hover:bg-white/5"
            }`}
            title={s.config.name}
          >
            <StatusDot status={s.status} size="md" />
          </button>
        ))}
        <button
          onClick={onNewSession}
          className="p-1.5 rounded-md text-white/30 hover:text-accent hover:bg-accent/10 transition-colors mt-1"
        >
          <Plus size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-60 bg-surface-1 border-r border-border flex flex-col">
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-border">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          Sessions
        </span>
        <div className="flex items-center gap-1">
          {onQuickLocal && (
            <button
              onClick={onQuickLocal}
              className="p-1 rounded text-white/40 hover:text-green-400 hover:bg-green-400/10 transition-colors"
              title="Quick local terminal (⌘T)"
            >
              <TerminalIcon size={14} />
            </button>
          )}
          <button
            onClick={onNewSession}
            className="p-1 rounded text-white/40 hover:text-accent hover:bg-accent/10 transition-colors"
            title="New session (⌘N)"
          >
            <Plus size={14} />
          </button>
          {sessionList.length > 0 && (
            <button
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className={`p-1 rounded transition-colors ${
                selectMode
                  ? "text-accent bg-accent/10"
                  : "text-white/40 hover:text-white/60 hover:bg-white/5"
              }`}
              title={selectMode ? "Exit select mode" : "Select sessions for bulk close"}
            >
              <CheckSquare size={14} />
            </button>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {sessionList.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <Server size={24} className="mx-auto mb-2 text-white/15" />
            <p className="text-xs text-white/30">No active sessions</p>
            <button
              onClick={onNewSession}
              className="mt-3 text-xs text-accent/70 hover:text-accent transition-colors"
            >
              + Create session
            </button>
          </div>
        ) : (
          sessionList.map((session) => {
            const isActive = activeSessionId === session.id;
            const isFocused = focusedSessionIds.has(session.id);
            const isSelected = selected.has(session.id);

            return (
              <div
                key={session.id}
                onClick={() =>
                  selectMode
                    ? toggleSelected(session.id)
                    : setActiveSession(session.id)
                }
                className={`group mx-1.5 mb-0.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                  selectMode && isSelected
                    ? "bg-red-500/10 border border-red-500/30"
                    : isActive
                    ? "bg-accent/10 border border-accent/20"
                    : "border border-transparent hover:bg-white/[0.03] hover:border-border"
                }`}
              >
                {/* Top row: name + controls */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {selectMode ? (
                      isSelected ? (
                        <CheckSquare size={14} className="text-red-400 shrink-0" />
                      ) : (
                        <Square size={14} className="text-white/30 shrink-0" />
                      )
                    ) : (
                      <StatusDot status={session.status} />
                    )}
                    <span className="text-[13px] font-medium text-white/85 truncate">
                      {session.config.name}
                    </span>
                    {session.config.tag && (() => {
                      const tc = tagColor(session.config.tag, session.config.color);
                      return tc ? (
                        <span
                          className="shrink-0 px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: `${tc}20`, color: tc }}
                        >
                          {session.config.tag}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFocusedSession(session.id);
                      }}
                      className={`p-0.5 rounded transition-colors ${
                        isFocused
                          ? "text-accent"
                          : "text-white/30 hover:text-white/60"
                      }`}
                      title={isFocused ? "Hide from grid" : "Show in grid"}
                    >
                      {isFocused ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseSession(session.id);
                      }}
                      className="p-0.5 rounded text-white/30 hover:text-red-400 transition-colors"
                      title="Close session"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {/* Info row */}
                <div className="flex items-center gap-3 text-[11px] text-white/35">
                  <span className="truncate">
                    {sessionHostLabel(session.config)}
                  </span>
                </div>

                {/* Status / task */}
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                    style={{
                      color: `${STATUS_LABELS[session.status] ? "inherit" : "#6b7280"}`,
                      backgroundColor: `${
                        session.status === "Connected"
                          ? "rgba(34,197,94,0.1)"
                          : session.status === "Thinking"
                          ? "rgba(245,158,11,0.1)"
                          : session.status === "Writing"
                          ? "rgba(59,130,246,0.1)"
                          : session.status === "Error"
                          ? "rgba(239,68,68,0.1)"
                          : "rgba(107,114,128,0.1)"
                      }`,
                    }}
                  >
                    {STATUS_LABELS[session.status]}
                  </span>
                  {session.connected_at && (
                    <span className="flex items-center gap-1 text-[10px] text-white/25">
                      <Clock size={9} />
                      {formatDistanceToNow(new Date(session.connected_at), { addSuffix: false })}
                    </span>
                  )}
                </div>

                {/* Current task */}
                {session.current_task && (
                  <p className="mt-1 text-[10px] text-white/30 truncate font-mono">
                    {session.current_task}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer — normal stats or bulk action bar */}
      {selectMode ? (
        <div className="px-3 py-2 border-t border-border space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-white/40">
            <span>{selected.size} of {sessionList.length} selected</span>
            <button
              onClick={selectAll}
              className="text-accent hover:text-accent-bright transition-colors"
            >
              Select all
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={deleteSelected}
              disabled={selected.size === 0}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                selected.size > 0
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                  : "bg-white/5 text-white/20 cursor-not-allowed border border-transparent"
              }`}
            >
              <Trash2 size={12} />
              Close {selected.size} session{selected.size !== 1 ? "s" : ""}
            </button>
            <button
              onClick={exitSelectMode}
              className="px-2 py-1.5 rounded-lg text-[11px] text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-border">
          <div className="flex items-center justify-between text-[10px] text-white/30">
            <span>
              {sessionList.filter((s) => s.status !== "Disconnected").length} active
            </span>
            <span>{sessionList.length} total</span>
          </div>
        </div>
      )}
    </div>
  );
}
