import { Clock, Activity, ArrowUpRight } from "lucide-react";
import { useSessionStore } from "../store/sessions";
import { StatusDot } from "./StatusDot";
import { STATUS_LABELS, STATUS_COLORS, tagColor } from "../types";
import { formatDistanceToNow } from "date-fns";
import type { SessionInfo } from "../types";

interface OverviewPanelProps {
  visible: boolean;
}

function SessionCard({ session, isActive, onClick }: {
  session: SessionInfo;
  isActive: boolean;
  onClick: () => void;
}) {
  const uptime = session.connected_at
    ? formatDistanceToNow(new Date(session.connected_at), { addSuffix: false })
    : "—";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
        isActive
          ? "border-accent/25 bg-accent/5"
          : "border-border hover:border-border-hover hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <StatusDot status={session.status} size="md" />
          <span className="text-[12px] font-semibold text-white/80 truncate max-w-[100px]">
            {session.config.name}
          </span>
          {session.config.tag && (() => {
            const tc = tagColor(session.config.tag, session.config.color);
            return tc ? (
              <span
                className="shrink-0 px-1 py-0.5 rounded text-[7px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: `${tc}20`, color: tc }}
              >
                {session.config.tag}
              </span>
            ) : null;
          })()}
        </div>
        <ArrowUpRight size={10} className="text-white/20" />
      </div>

      <div className="flex items-center gap-3 text-[10px] text-white/30">
        <span
          className="px-1.5 py-0.5 rounded font-medium"
          style={{
            backgroundColor: `${STATUS_COLORS[session.status]}15`,
            color: STATUS_COLORS[session.status],
          }}
        >
          {STATUS_LABELS[session.status]}
        </span>
        <span className="flex items-center gap-0.5">
          <Clock size={8} />
          {uptime}
        </span>
      </div>

      {session.current_task && (
        <p className="mt-1.5 text-[10px] text-white/25 font-mono truncate">
          {session.current_task}
        </p>
      )}
    </button>
  );
}

export function OverviewPanel({ visible }: OverviewPanelProps) {
  const { sessions, activeSessionId, setActiveSession } = useSessionStore();
  const sessionList = Array.from(sessions.values());

  if (!visible || sessionList.length === 0) return null;

  const connected = sessionList.filter((s) => s.status !== "Disconnected").length;
  const thinking = sessionList.filter(
    (s) => s.status === "Thinking" || s.status === "Writing" || s.status === "RunningCommand"
  ).length;

  return (
    <div className="w-56 bg-surface-1 border-l border-border flex flex-col">
      {/* Header */}
      <div className="h-10 px-3 flex items-center justify-between border-b border-border">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          Overview
        </span>
        <div className="flex items-center gap-2 text-[10px] text-white/30">
          <span className="flex items-center gap-1">
            <Activity size={9} className="text-status-connected" />
            {connected}
          </span>
          {thinking > 0 && (
            <span className="flex items-center gap-1">
              <Activity size={9} className="text-status-thinking" />
              {thinking}
            </span>
          )}
        </div>
      </div>

      {/* Session cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {sessionList.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isActive={activeSessionId === session.id}
            onClick={() => setActiveSession(session.id)}
          />
        ))}
      </div>
    </div>
  );
}
