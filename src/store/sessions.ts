import { create } from "zustand";
import type { SessionInfo, SessionConfig, SessionStatus } from "../types";

interface SessionsState {
  sessions: Map<string, SessionInfo>;
  activeSessionId: string | null;
  focusedSessionIds: Set<string>;
  layoutMode: string;
  sidebarOpen: boolean;
  /** Broadcast mode: when true, keystrokes from any panel in `broadcastTargets`
   *  are mirrored to every other target. */
  broadcastMode: boolean;
  broadcastTargets: Set<string>;
  /** Per-session bytes_received seen at last "view" time, used to compute
   *  "activity since last viewed" badges. */
  lastSeenBytes: Map<string, number>;

  // Actions
  addSession: (info: SessionInfo) => void;
  removeSession: (id: string) => void;
  updateStatus: (id: string, status: SessionStatus, task?: string | null) => void;
  updateActivity: (id: string) => void;
  setKeepAwakeLocal: (id: string, enabled: boolean) => void;
  bumpBytes: (id: string, n: number) => void;
  markViewed: (id: string) => void;
  updateSessionConfig: (id: string, partial: Partial<SessionConfig>) => void;
  setBroadcastMode: (enabled: boolean, targets?: string[]) => void;
  toggleBroadcastTarget: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  toggleFocusedSession: (id: string) => void;
  setFocusedSessions: (ids: string[]) => void;
  setLayoutMode: (mode: string) => void;
  toggleSidebar: () => void;
}

export const useSessionStore = create<SessionsState>((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,
  focusedSessionIds: new Set(),
  layoutMode: "focus",
  sidebarOpen: true,
  broadcastMode: false,
  broadcastTargets: new Set(),
  lastSeenBytes: new Map(),

  addSession: (info) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.set(info.id, info);
      const focusedSessionIds = new Set(state.focusedSessionIds);
      focusedSessionIds.add(info.id);
      return {
        sessions,
        activeSessionId: info.id,
        focusedSessionIds,
      };
    }),

  removeSession: (id) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.delete(id);
      const focusedSessionIds = new Set(state.focusedSessionIds);
      focusedSessionIds.delete(id);
      const activeSessionId =
        state.activeSessionId === id
          ? sessions.keys().next().value ?? null
          : state.activeSessionId;
      return { sessions, activeSessionId, focusedSessionIds };
    }),

  updateStatus: (id, status, task) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(id);
      if (session) {
        sessions.set(id, {
          ...session,
          status,
          current_task: task ?? session.current_task,
          last_activity: new Date().toISOString(),
        });
      }
      return { sessions };
    }),

  updateActivity: (id) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(id);
      if (session) {
        sessions.set(id, {
          ...session,
          last_activity: new Date().toISOString(),
        });
      }
      return { sessions };
    }),

  setKeepAwakeLocal: (id, enabled) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(id);
      if (session) {
        sessions.set(id, { ...session, keep_awake: enabled });
      }
      return { sessions };
    }),

  bumpBytes: (id, n) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(id);
      if (session) {
        sessions.set(id, {
          ...session,
          bytes_received: session.bytes_received + n,
          last_activity: new Date().toISOString(),
        });
      }
      return { sessions };
    }),

  markViewed: (id) =>
    set((state) => {
      const session = state.sessions.get(id);
      if (!session) return {};
      const next = new Map(state.lastSeenBytes);
      next.set(id, session.bytes_received);
      return { lastSeenBytes: next };
    }),

  updateSessionConfig: (id, partial) =>
    set((state) => {
      const sessions = new Map(state.sessions);
      const session = sessions.get(id);
      if (session) {
        sessions.set(id, {
          ...session,
          config: { ...session.config, ...partial },
        });
      }
      return { sessions };
    }),

  setBroadcastMode: (enabled, targets) =>
    set((state) => ({
      broadcastMode: enabled,
      broadcastTargets:
        enabled && targets ? new Set(targets) : enabled ? state.broadcastTargets : new Set(),
    })),

  toggleBroadcastTarget: (id) =>
    set((state) => {
      const next = new Set(state.broadcastTargets);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { broadcastTargets: next };
    }),

  setActiveSession: (id) =>
    set((state) => {
      // Mark as viewed when becoming active
      if (id) {
        const session = state.sessions.get(id);
        if (session) {
          const seen = new Map(state.lastSeenBytes);
          seen.set(id, session.bytes_received);
          return { activeSessionId: id, lastSeenBytes: seen };
        }
      }
      return { activeSessionId: id };
    }),

  toggleFocusedSession: (id) =>
    set((state) => {
      const focusedSessionIds = new Set(state.focusedSessionIds);
      if (focusedSessionIds.has(id)) {
        focusedSessionIds.delete(id);
      } else {
        focusedSessionIds.add(id);
      }
      return { focusedSessionIds };
    }),

  setFocusedSessions: (ids) =>
    set({ focusedSessionIds: new Set(ids) }),

  setLayoutMode: (mode) => set({ layoutMode: mode }),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
