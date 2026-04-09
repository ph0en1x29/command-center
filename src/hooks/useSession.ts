import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSessionStore } from "../store/sessions";
import type { SessionConfig, SessionInfo, SessionOutput, StatusUpdate } from "../types";

export function useSession() {
  const { addSession, removeSession, updateActivity, setKeepAwakeLocal, updateSessionConfig: updateConfigLocal } = useSessionStore();

  const createSession = useCallback(
    async (config: SessionConfig) => {
      try {
        const info = await invoke<SessionInfo>("create_session", { config });
        addSession(info);
        return info;
      } catch (err) {
        console.error("Failed to create session:", err);
        throw err;
      }
    },
    [addSession]
  );

  const closeSession = useCallback(
    async (sessionId: string) => {
      try {
        await invoke("close_session", { sessionId });
        removeSession(sessionId);
      } catch (err) {
        console.error("Failed to close session:", err);
      }
    },
    [removeSession]
  );

  const writeToSession = useCallback(
    async (sessionId: string, data: string) => {
      try {
        // Broadcast: if mode is on and this session is a target, fan-out to all targets
        const { broadcastMode, broadcastTargets } = useSessionStore.getState();
        if (broadcastMode && broadcastTargets.has(sessionId) && broadcastTargets.size > 1) {
          const targets = Array.from(broadcastTargets);
          await Promise.all(
            targets.map((id) => invoke("write_to_session", { sessionId: id, data }))
          );
          targets.forEach((id) => updateActivity(id));
          return;
        }
        await invoke("write_to_session", { sessionId, data });
        updateActivity(sessionId);
      } catch (err) {
        console.error("Failed to write to session:", err);
      }
    },
    [updateActivity]
  );

  const resizeSession = useCallback(async (sessionId: string, cols: number, rows: number) => {
    try {
      await invoke("resize_session", { sessionId, cols, rows });
    } catch (err) {
      console.error("Failed to resize session:", err);
    }
  }, []);

  const setKeepAwake = useCallback(
    async (sessionId: string, enabled: boolean) => {
      try {
        await invoke("set_keep_awake", { sessionId, enabled });
        setKeepAwakeLocal(sessionId, enabled);
      } catch (err) {
        console.error("Failed to toggle keep-awake:", err);
      }
    },
    [setKeepAwakeLocal]
  );

  const updateConfig = useCallback(
    async (sessionId: string, partial: Partial<SessionConfig>) => {
      try {
        // Build a full SessionConfig with defaults for booleans
        const current = useSessionStore.getState().sessions.get(sessionId)?.config;
        const merged = {
          ...(current || {}),
          ...partial,
          name: partial.name ?? current?.name ?? "",
          auto_reconnect: partial.auto_reconnect ?? current?.auto_reconnect ?? false,
          wrap_in_tmux: partial.wrap_in_tmux ?? current?.wrap_in_tmux ?? false,
          dangerous_command_confirm:
            partial.dangerous_command_confirm ?? current?.dangerous_command_confirm ?? false,
          notification_level:
            partial.notification_level ?? current?.notification_level ?? "all",
        };
        await invoke("update_session_config", {
          sessionId,
          partial: merged,
        });
        updateConfigLocal(sessionId, partial);
      } catch (err) {
        console.error("Failed to update session config:", err);
      }
    },
    [updateConfigLocal]
  );

  const readTranscript = useCallback(async (sessionId: string): Promise<string> => {
    try {
      return await invoke<string>("read_transcript", { sessionId });
    } catch (err) {
      console.error("Failed to read transcript:", err);
      return "";
    }
  }, []);

  return {
    createSession,
    closeSession,
    writeToSession,
    resizeSession,
    setKeepAwake,
    updateConfig,
    readTranscript,
  };
}

// Global event listeners — call once at app root
export function useSessionEvents(
  onOutput: (data: SessionOutput) => void,
  onStatus: (data: StatusUpdate) => void
) {
  const setupListeners = useCallback(async () => {
    const unlistenOutput = await listen<SessionOutput>("session-output", (event) => {
      onOutput(event.payload);
    });
    const unlistenStatus = await listen<StatusUpdate>("session-status", (event) => {
      onStatus(event.payload);
    });
    return () => {
      unlistenOutput();
      unlistenStatus();
    };
  }, [onOutput, onStatus]);

  return setupListeners;
}
