import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Profile } from "../types";

interface ProfilesState {
  profiles: Profile[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  save: (profile: Profile) => Promise<Profile>;
  remove: (id: string) => Promise<void>;
  importSshConfig: () => Promise<{ added: number; total: number }>;
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const profiles = await invoke<Profile[]>("list_profiles");
      set({ profiles, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  save: async (profile) => {
    const saved = await invoke<Profile>("save_profile", { profile });
    set((state) => {
      const idx = state.profiles.findIndex((p) => p.id === saved.id);
      const next = [...state.profiles];
      if (idx >= 0) next[idx] = saved;
      else next.push(saved);
      return { profiles: next };
    });
    return saved;
  },

  remove: async (id) => {
    await invoke("delete_profile", { id });
    set((state) => ({ profiles: state.profiles.filter((p) => p.id !== id) }));
  },

  importSshConfig: async () => {
    const before = get().profiles.length;
    const profiles = await invoke<Profile[]>("import_ssh_config");
    set({ profiles });
    return { added: profiles.length - before, total: profiles.length };
  },
}));
