import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { ChevronDown, Coffee, Clock, Copy, Radio, RotateCw, Settings, X as XIcon } from "lucide-react";
import { useTerminal } from "../hooks/useTerminal";
import { useSession } from "../hooks/useSession";
import { useTick } from "../hooks/useTick";
import { useSessionStore } from "../store/sessions";
import { StatusDot } from "./StatusDot";
import { SessionSettingsPanel } from "./SessionSettingsPanel";
import { DangerousCommandModal } from "./DangerousCommandModal";
import {
  sessionHostLabel,
  formatDuration,
  formatBytes,
  tagColor,
  isDangerousCommand,
  type SessionInfo,
} from "../types";

interface TerminalPanelProps {
  session: SessionInfo;
  isActive: boolean;
  compact?: boolean;
  onFocus: () => void;
  registerWriter?: (id: string, writer: (data: string) => void) => void;
  unregisterWriter?: (id: string) => void;
  /** Called when the user picks a different session from the header dropdown. */
  onSwapSession?: (newSessionId: string) => void;
}

export function TerminalPanel({
  session,
  isActive,
  compact,
  onFocus,
  registerWriter,
  unregisterWriter,
  onSwapSession,
}: TerminalPanelProps) {
  const { writeToSession, resizeSession, setKeepAwake, readTranscript, readTranscriptTail } = useSession();
  const { broadcastMode, broadcastTargets, lastSeenBytes, markViewed } = useSessionStore();
  const containerRef = useRef<HTMLDivElement>(null);
  useTick(1000);

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  // Session picker dropdown
  const [showPicker, setShowPicker] = useState(false);
  const allSessions = Array.from(useSessionStore.getState().sessions.values());

  // Close picker on any click outside
  useEffect(() => {
    if (!showPicker) return;
    const close = () => setShowPicker(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [showPicker]);

  // Dangerous-command interception state
  const lineBuf = useRef("");
  const [pendingDangerous, setPendingDangerous] = useState<{
    cmd: string;
    enterData: string;
  } | null>(null);

  const onData = useCallback(
    (data: string) => {
      // If dangerous-command modal is showing, eat all input
      if (pendingDangerous) return;

      const dangerousEnabled = session.config.dangerous_command_confirm;

      if (!dangerousEnabled) {
        writeToSession(session.id, data);
        return;
      }

      // Check for Enter (\r) in the data
      const enterIdx = data.indexOf("\r");
      if (enterIdx === -1) {
        // No Enter — accumulate printable chars + handle backspace
        for (const ch of data) {
          if (ch === "\x7f" || ch === "\b") {
            lineBuf.current = lineBuf.current.slice(0, -1);
          } else if (ch === "\x03") {
            // Ctrl+C — clear buffer
            lineBuf.current = "";
          } else if (ch.charCodeAt(0) >= 32) {
            lineBuf.current += ch;
          }
        }
        writeToSession(session.id, data);
        return;
      }

      // There's an Enter. Send everything before it.
      const before = data.substring(0, enterIdx);
      if (before) {
        for (const ch of before) {
          if (ch === "\x7f" || ch === "\b") {
            lineBuf.current = lineBuf.current.slice(0, -1);
          } else if (ch.charCodeAt(0) >= 32) {
            lineBuf.current += ch;
          }
        }
        writeToSession(session.id, before);
      }

      const line = lineBuf.current.trim();
      if (isDangerousCommand(line)) {
        // Intercept: hold the Enter + rest, show modal
        setPendingDangerous({ cmd: line, enterData: data.substring(enterIdx) });
        return;
      }

      // Not dangerous — send the Enter + anything after it
      lineBuf.current = "";
      writeToSession(session.id, data.substring(enterIdx));
    },
    [session.id, session.config.dangerous_command_confirm, writeToSession, pendingDangerous]
  );

  const confirmDangerous = useCallback(() => {
    if (pendingDangerous) {
      lineBuf.current = "";
      writeToSession(session.id, pendingDangerous.enterData);
      setPendingDangerous(null);
    }
  }, [pendingDangerous, session.id, writeToSession]);

  const cancelDangerous = useCallback(() => {
    lineBuf.current = "";
    // Send Ctrl+C to clear the shell line
    writeToSession(session.id, "\x03");
    setPendingDangerous(null);
  }, [session.id, writeToSession]);

  const { terminalRef, initTerminal, write, fit, focus, terminal } = useTerminal({
    fontSize: compact ? 9 : 12,
    onData,
    onResize: (cols, rows) => {
      resizeSession(session.id, cols, rows);
    },
  });

  useEffect(() => {
    initTerminal();
    // Load recent output so the terminal shows content after remount.
    // Then send Ctrl+L to the PTY to make the remote app redraw cleanly
    // at the current terminal size (avoids garbled old-size content).
    readTranscriptTail(session.id).then((tail) => {
      if (tail) write(tail);
      // Small delay so the fit() has time to set correct dimensions
      // before asking the remote to redraw.
      setTimeout(() => writeToSession(session.id, "\x0c"), 300);
    }).catch(() => {});
  }, [initTerminal, session.id, write, readTranscriptTail, writeToSession]);

  useEffect(() => {
    registerWriter?.(session.id, write);
    return () => {
      unregisterWriter?.(session.id);
    };
  }, [session.id, write, registerWriter, unregisterWriter]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => fit());
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fit]);

  // One delayed fit as a safety net — catches cases where fonts.ready
  // resolved before the container had its final dimensions.
  useEffect(() => {
    const t = setTimeout(() => fit(), 500);
    return () => clearTimeout(t);
  }, [fit]);

  useEffect(() => {
    if (isActive) {
      setTimeout(() => {
        fit();
        focus();
        markViewed(session.id);
      }, 50);
    }
  }, [isActive, focus, session.id, markViewed]);

  const now = Date.now();
  const uptimeMs = session.connected_at ? now - new Date(session.connected_at).getTime() : 0;
  const idleMs = now - new Date(session.last_activity).getTime();
  const showIdle = idleMs > 30_000 && session.status !== "Disconnected";

  const isBroadcasting = broadcastMode && broadcastTargets.has(session.id);
  const tagAccent = useMemo(
    () => tagColor(session.config.tag, session.config.color),
    [session.config.tag, session.config.color]
  );

  const seen = lastSeenBytes.get(session.id) ?? session.bytes_received;
  const newBytes = Math.max(0, session.bytes_received - seen);
  const showActivityBadge = !isActive && newBytes > 0;

  const handleKeepAwake = (e: React.MouseEvent) => {
    e.stopPropagation();
    setKeepAwake(session.id, !session.keep_awake);
  };

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const transcript = await readTranscript(session.id);
      const md = [
        `# ${session.config.name}`,
        `_${sessionHostLabel(session.config)} · ${new Date().toLocaleString()}_`,
        "",
        "```",
        transcript || "(empty)",
        "```",
        "",
      ].join("\n");
      await navigator.clipboard.writeText(md);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const handleDismissActivity = (e: React.MouseEvent) => {
    e.stopPropagation();
    markViewed(session.id);
  };

  // Border style — keep it subtle; tags are shown as pills in the header instead
  let borderClass = "border-border hover:border-border-hover";

  if (isBroadcasting) {
    borderClass = "border-red-500/70 shadow-lg shadow-red-500/20 ring-1 ring-red-500/50";
  } else if (isActive) {
    borderClass = "border-accent/30 shadow-lg shadow-accent/5";
  }

  return (
    <div
      ref={containerRef}
      data-session-id={session.id}
      onClick={onFocus}
      className={`relative flex flex-col h-full rounded-xl overflow-hidden border-2 transition-colors ${borderClass}`}
    >
      {/* Broadcast badge (kept — broadcast needs to be unmissable) */}
      {isBroadcasting && (
        <div className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider bg-red-500 text-white">
          BROADCAST
        </div>
      )}

      {/* Activity-since-viewed badge */}
      {showActivityBadge && (
        <button
          onClick={handleDismissActivity}
          className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-accent/30 text-accent border border-accent/40 hover:bg-accent/50 transition-colors"
          title={`${formatBytes(newBytes)} of new output since you last viewed this. Click to dismiss.`}
        >
          +{formatBytes(newBytes)}
          <XIcon size={8} className="inline ml-1 opacity-60" />
        </button>
      )}

      {/* Terminal header */}
      <div className="session-drag-handle h-8 px-3 flex items-center justify-between bg-surface-2 border-b border-border shrink-0 cursor-grab active:cursor-grabbing gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={session.status} size="sm" />
          {onSwapSession ? (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowPicker((v) => !v); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 text-[11px] font-medium text-white/60 hover:text-white/90 transition-colors cursor-pointer truncate max-w-[160px]"
              >
                {session.config.name}
                <ChevronDown size={10} className="shrink-0 opacity-50" />
              </button>
              {showPicker && (
                <div
                  className="fixed z-[9999] bg-surface-2 border border-border rounded-lg shadow-xl py-1 min-w-[160px] max-h-[200px] overflow-y-auto"
                  style={{
                    top: (containerRef.current?.querySelector(".session-drag-handle")?.getBoundingClientRect().bottom ?? 0) + 2,
                    left: containerRef.current?.querySelector(".session-drag-handle")?.getBoundingClientRect().left ?? 0,
                  }}
                >
                  {allSessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPicker(false);
                        if (s.id !== session.id) onSwapSession!(s.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className={`w-full px-3 py-1.5 text-left text-[11px] truncate cursor-pointer transition-colors ${
                        s.id === session.id
                          ? "text-accent bg-accent/10"
                          : "text-white/60 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {s.config.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="text-[11px] font-medium text-white/60 truncate max-w-[160px]">
              {session.config.name}
            </span>
          )}
          {tagAccent && session.config.tag && (
            <span
              className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: `${tagAccent}20`, color: tagAccent }}
            >
              {session.config.tag}
            </span>
          )}
          <span className="text-[10px] text-white/25 font-mono truncate">
            {sessionHostLabel(session.config)}
          </span>
          {session.reconnect_count > 0 && (
            <span
              className="text-[9px] text-amber-400/70 font-mono"
              title={`Auto-reconnected ${session.reconnect_count} time${session.reconnect_count > 1 ? "s" : ""}`}
            >
              <RotateCw size={9} className="inline" /> {session.reconnect_count}
            </span>
          )}
        </div>

        {session.current_task && (
          <span className="flex-1 text-[10px] text-white/30 font-mono truncate text-center">
            {session.current_task}
          </span>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {session.connected_at && (
            <span className="flex items-center gap-1 text-[10px] text-white/30 font-mono">
              <Clock size={9} />
              {formatDuration(uptimeMs)}
            </span>
          )}
          {showIdle && (
            <span className="text-[10px] text-amber-400/60 font-mono">
              idle {formatDuration(idleMs)}
            </span>
          )}
          {isBroadcasting && (
            <span title="This panel is part of an active broadcast group">
              <Radio size={11} className="text-red-400 animate-pulse" />
            </span>
          )}
          <button
            onClick={handleExport}
            onMouseDown={(e) => e.stopPropagation()}
            title="Export transcript as Markdown to clipboard"
            className="p-0.5 rounded text-white/25 hover:text-white/60 transition-colors cursor-pointer"
          >
            <Copy size={11} />
          </button>
          <button
            onClick={handleKeepAwake}
            onMouseDown={(e) => e.stopPropagation()}
            title={
              session.keep_awake
                ? "Keep Awake ON — sending heartbeat every 30s"
                : "Keep Awake OFF — click to prevent inactivity disconnects"
            }
            className={`p-0.5 rounded transition-colors cursor-pointer ${
              session.keep_awake
                ? "text-amber-400 hover:text-amber-300"
                : "text-white/25 hover:text-white/50"
            }`}
          >
            <Coffee size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSettings((v) => !v);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Session settings — edit name, tag, notifications, auto-reconnect, and more"
            className={`p-0.5 rounded transition-colors cursor-pointer ${
              showSettings ? "text-accent" : "text-white/25 hover:text-white/50"
            }`}
          >
            <Settings size={11} />
          </button>
        </div>
      </div>

      {/* Settings overlay (anchored to top-right of panel) */}
      {showSettings && (
        <SessionSettingsPanel
          session={session}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Terminal body */}
      <div ref={terminalRef} className="flex-1 bg-surface-0 min-h-0 overflow-hidden" />

      {/* Dangerous command modal */}
      {pendingDangerous && (
        <DangerousCommandModal
          command={pendingDangerous.cmd}
          sessionName={session.config.name}
          onConfirm={confirmDangerous}
          onCancel={cancelDangerous}
        />
      )}
    </div>
  );
}
