import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { LayoutBar } from "./components/LayoutBar";
import { TerminalGrid } from "./components/TerminalGrid";
import { OverviewPanel } from "./components/OverviewPanel";
import { NewSessionModal } from "./components/NewSessionModal";
import { StatusBar } from "./components/StatusBar";
import { HelpPanel } from "./components/HelpPanel";
import { CloseSessionModal } from "./components/CloseSessionModal";
import { useSession } from "./hooks/useSession";
import { useSessionStore } from "./store/sessions";
import type { SessionConfig, SessionOutput, StatusUpdate } from "./types";

export default function App() {
  const [showNewSession, setShowNewSession] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);
  const [overviewVisible, setOverviewVisible] = useState(true);
  const { createSession, closeSession } = useSession();
  const { updateStatus, sessions } = useSessionStore();
  // Map of session id → write function. TerminalPanel registers itself here
  // on mount and unregisters on unmount, so output routing never depends on
  // querying the DOM (which broke when panels remounted).
  const outputHandlers = useRef(new Map<string, (data: string) => void>());

  // Listen for terminal output + status from the Rust backend, plus tray events.
  // Carefully handles StrictMode double-mount via a `cancelled` flag.
  useEffect(() => {
    let cancelled = false;
    const unlistens: Array<() => void> = [];

    (async () => {
      const u1 = await listen<SessionOutput>("session-output", (event) => {
        const { session_id, data } = event.payload;
        const writer = outputHandlers.current.get(session_id);
        if (writer) writer(data);
      });
      const u2 = await listen<StatusUpdate>("session-status", (event) => {
        const { session_id, status, task } = event.payload;
        updateStatus(session_id, status, task);
      });
      // Tray menu → switch active session
      const u3 = await listen<string>("activate-session", (event) => {
        useSessionStore.getState().setActiveSession(event.payload);
      });
      // Tray menu → New Session
      const u4 = await listen<unknown>("tray-new-session", () => {
        setShowNewSession(true);
      });
      if (cancelled) {
        u1();
        u2();
        u3();
        u4();
        return;
      }
      unlistens.push(u1, u2, u3, u4);
    })();

    return () => {
      cancelled = true;
      unlistens.forEach((u) => u());
    };
  }, [updateStatus]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+N: new session modal
      if (e.metaKey && !e.shiftKey && e.key === "n") {
        e.preventDefault();
        setShowNewSession(true);
      }
      // Cmd+T: quick local terminal (no modal)
      if (e.metaKey && !e.shiftKey && e.key === "t") {
        e.preventDefault();
        const n = Array.from(useSessionStore.getState().sessions.values()).length + 1;
        createSession({ name: `Terminal ${n}`, kind: "local" }).catch(() => {});
      }
      // Cmd+\: toggle sidebar
      if (e.metaKey && e.key === "\\") {
        e.preventDefault();
        useSessionStore.getState().toggleSidebar();
      }
      // Cmd+Shift+O: toggle overview
      if (e.metaKey && e.shiftKey && e.key === "O") {
        e.preventDefault();
        setOverviewVisible((v) => !v);
      }
      // Cmd+1-6: switch layout
      const layoutKeys: Record<string, string> = {
        "1": "focus",
        "2": "split",
        "3": "vsplit",
        "4": "grid",
        "5": "free",
        "6": "monitor",
      };
      if (e.metaKey && !e.shiftKey && layoutKeys[e.key]) {
        e.preventDefault();
        useSessionStore.getState().setLayoutMode(layoutKeys[e.key]);
      }
      // Cmd+Shift+B: toggle broadcast mode
      if (e.metaKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        const s = useSessionStore.getState();
        if (s.broadcastMode) {
          s.setBroadcastMode(false);
        } else {
          const targets =
            s.focusedSessionIds.size > 0
              ? Array.from(s.focusedSessionIds)
              : Array.from(s.sessions.keys());
          s.setBroadcastMode(true, targets);
        }
      }
      // Cmd+? (Cmd+Shift+/): help
      if (e.metaKey && (e.key === "?" || (e.shiftKey && e.key === "/"))) {
        e.preventDefault();
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleCreateSession = useCallback(
    async (config: SessionConfig) => {
      try {
        await createSession(config);
      } catch (err) {
        console.error("Failed to create session:", err);
      }
    },
    [createSession]
  );

  // Quick-launch: instant local terminal with auto-generated name, no modal
  const handleQuickLocal = useCallback(async () => {
    try {
      const n = Array.from(sessions.values()).length + 1;
      await createSession({ name: `Terminal ${n}`, kind: "local" });
    } catch (err) {
      console.error("Quick launch failed:", err);
    }
  }, [createSession, sessions]);

  // Instead of closing immediately, set pending → show confirmation modal
  const handleCloseSession = useCallback((id: string) => {
    setPendingCloseId(id);
  }, []);

  const confirmClose = useCallback(async () => {
    if (pendingCloseId) {
      await closeSession(pendingCloseId);
      setPendingCloseId(null);
    }
  }, [pendingCloseId, closeSession]);

  // Update macOS dock badge with count of sessions that "need attention"
  useEffect(() => {
    try {
      const all = Array.from(sessions.values());
      const attention = all.filter(
        (s) => s.status === "Error" || s.status === "Thinking"
      ).length;
      const win = getCurrentWindow();
      win.setBadgeLabel(attention > 0 ? String(attention) : undefined).catch(() => {});
    } catch {}
  }, [sessions]);

  // ── Sleep guard ─────────────────────────────────────────────────────
  // When the window loses visibility (sleep / switch away), snapshot which
  // sessions are connected. When it regains visibility, check which ones
  // dropped and show a summary alert + an in-app notification via the
  // Rust backend (avoids the fragile JS plugin import).
  const connectedSnapshot = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handler = () => {
      const all = Array.from(useSessionStore.getState().sessions.values());
      if (document.visibilityState === "hidden") {
        // Going away — snapshot connected sessions
        connectedSnapshot.current = new Set(
          all
            .filter((s) => s.status !== "Disconnected" && s.status !== "Connecting")
            .map((s) => s.id)
        );
      } else if (document.visibilityState === "visible") {
        // Coming back — check what dropped
        const prev = connectedSnapshot.current;
        if (prev.size === 0) return;
        const dropped = all.filter(
          (s) => prev.has(s.id) && s.status === "Disconnected"
        );
        if (dropped.length > 0) {
          const names = dropped.map((s) => s.config.name).join(", ");
          // Use Notification API (works in Tauri webview without extra plugins)
          try {
            new Notification("Sessions disconnected while away", {
              body: `${dropped.length} of ${prev.size} sessions dropped: ${names}`,
            });
          } catch {}
        }
        connectedSnapshot.current = new Set();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // ── Sleep guard ────────────────────────────────────────────────────
  // When the page becomes hidden (e.g. Mac sleep, window minimised),
  // snapshot connected session ids.  When it becomes visible again,
  return (
    <div className="h-screen w-screen flex flex-col bg-surface-0 overflow-hidden">
      <TitleBar onShowHelp={() => setShowHelp(true)} />

      <div className="flex-1 flex min-h-0">
        {/* Left: sidebar */}
        <Sidebar
          onNewSession={() => setShowNewSession(true)}
          onCloseSession={handleCloseSession}
          onQuickLocal={handleQuickLocal}
        />

        {/* Center: layout bar + terminal grid */}
        <div className="flex-1 flex flex-col min-w-0">
          <LayoutBar
            overviewVisible={overviewVisible}
            onToggleOverview={() => setOverviewVisible((v) => !v)}
          />
          <TerminalGrid outputHandlers={outputHandlers} />
        </div>

        {/* Right: overview panel */}
        <OverviewPanel visible={overviewVisible} />
      </div>

      {/* Bottom status bar */}
      <StatusBar />

      {/* Modals */}
      {showNewSession && (
        <NewSessionModal
          onClose={() => setShowNewSession(false)}
          onCreate={handleCreateSession}
        />
      )}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
      {pendingCloseId && (() => {
        const session = sessions.get(pendingCloseId);
        return session ? (
          <CloseSessionModal
            session={session}
            onConfirm={confirmClose}
            onCancel={() => setPendingCloseId(null)}
          />
        ) : null;
      })()}
    </div>
  );
}
