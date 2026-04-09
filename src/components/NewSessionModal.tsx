import { useEffect, useMemo, useState } from "react";
import {
  X,
  Server,
  FolderOpen,
  Key,
  Zap,
  Terminal as TerminalIcon,
  Download,
  Trash2,
  Play,
  Star,
  Search,
  Tag,
  RotateCw,
  Layers,
} from "lucide-react";
import type { SessionConfig, SessionKind, Profile } from "../types";
import { profileToSessionConfig, TAG_COLORS } from "../types";
import { useProfilesStore } from "../store/profiles";
import { useSessionStore } from "../store/sessions";

interface NewSessionModalProps {
  onClose: () => void;
  onCreate: (config: SessionConfig) => void;
}

const blank = (kind: SessionKind): SessionConfig => ({
  name: "",
  kind,
  host: "",
  user: "",
  port: 22,
  identity_file: undefined,
  project_dir: undefined,
  startup_command: undefined,
  description: undefined,
  tag: undefined,
  wrap_in_tmux: false,
  auto_reconnect: false,
});

const TAG_OPTIONS: Array<{ id: string; label: string; color: string }> = [
  { id: "", label: "None", color: "transparent" },
  { id: "personal", label: "Personal", color: TAG_COLORS.personal },
  { id: "dev", label: "Dev", color: TAG_COLORS.dev },
  { id: "staging", label: "Staging", color: TAG_COLORS.staging },
  { id: "prod", label: "Prod", color: TAG_COLORS.prod },
];

export function NewSessionModal({ onClose, onCreate }: NewSessionModalProps) {
  const { profiles, load, save, remove, importSshConfig } = useProfilesStore();
  const [kind, setKind] = useState<SessionKind>("ssh");
  const [config, setConfig] = useState<SessionConfig>(() => blank("ssh"));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveAsProfile, setSaveAsProfile] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileSearch, setProfileSearch] = useState("");

  useEffect(() => {
    load();
  }, [load]);

  const isValid =
    kind === "local"
      ? true  // name is optional for local — auto-generated if blank
      : !!(config.host?.trim()) && !!(config.user?.trim());

  const switchKind = (next: SessionKind) => {
    setKind(next);
    setConfig((c) => ({ ...c, kind: next }));
    setActiveProfileId(null);
  };

  const applyProfile = (p: Profile) => {
    setKind(p.kind);
    setConfig(profileToSessionConfig(p));
    setActiveProfileId(p.id);
    if (p.kind === "ssh" && (p.working_directory || p.startup_command)) {
      setShowAdvanced(true);
    }
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    // Auto-name if blank
    const autoName = config.name.trim()
      ? config.name.trim()
      : kind === "local"
        ? `Terminal ${Array.from(useSessionStore.getState().sessions.values()).length + 1}`
        : `${config.host || "session"} ${Array.from(useSessionStore.getState().sessions.values()).length + 1}`;

    const payload: SessionConfig =
      kind === "local"
        ? {
            name: autoName,
            kind: "local",
            project_dir: config.project_dir || undefined,
            startup_command: config.startup_command || undefined,
          }
        : { ...config, name: autoName || config.name, kind: "ssh" };

    // Carry the imported ssh_alias through if the user clicked a profile chip
    const activeProfile = profiles.find((p) => p.id === activeProfileId);
    if (activeProfile?.ssh_alias) {
      payload.ssh_alias = activeProfile.ssh_alias;
    }

    if (saveAsProfile) {
      try {
        await save({
          id: "",
          name: payload.name,
          kind: payload.kind!,
          host: payload.host || null,
          user: payload.user || null,
          port: payload.port || null,
          identity_file: payload.identity_file || null,
          working_directory: payload.project_dir || null,
          startup_command: payload.startup_command || null,
          ssh_alias: payload.ssh_alias || null,
          description: payload.description || null,
          tag: payload.tag || null,
          color: payload.color || null,
          wrap_in_tmux: payload.wrap_in_tmux || false,
          auto_reconnect: payload.auto_reconnect || false,
          created_at: new Date(0).toISOString(),
          source: "manual",
        });
      } catch (err) {
        console.error("Save profile failed:", err);
      }
    }

    onCreate(payload);
    onClose();
  };

  const handleImport = async () => {
    setImportMsg(null);
    try {
      const { added, total } = await importSshConfig();
      setImportMsg(
        added === 0
          ? `No new entries (${total} total)`
          : `Imported ${added} new ${added === 1 ? "host" : "hosts"} (${total} total)`
      );
    } catch (err) {
      setImportMsg(`Failed: ${err}`);
    }
  };

  const handleDeleteProfile = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await remove(id);
      if (activeProfileId === id) setActiveProfileId(null);
    } catch (err) {
      console.error("Delete profile failed:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isValid && (e.target as HTMLElement).tagName !== "BUTTON") {
      handleSubmit();
    }
    if (e.key === "Escape") onClose();
  };

  const visibleProfiles = useMemo(() => {
    const base = profiles.filter((p) => p.kind === kind);
    if (!profileSearch.trim()) return base;
    const q = profileSearch.toLowerCase();
    return base.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.host || "").toLowerCase().includes(q) ||
        (p.tag || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
    );
  }, [profiles, kind, profileSearch]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-[560px] max-h-[90vh] flex flex-col bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Server size={16} className="text-accent" />
            <h2 className="text-sm font-semibold text-white/90">New Session</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Kind tabs */}
        <div className="px-5 pt-4 shrink-0">
          <div className="inline-flex p-0.5 bg-surface-1 border border-border rounded-lg">
            <button
              onClick={() => switchKind("ssh")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                kind === "ssh" ? "bg-accent/15 text-accent" : "text-white/40 hover:text-white/70"
              }`}
            >
              <Server size={12} />
              SSH
            </button>
            <button
              onClick={() => switchKind("local")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                kind === "local" ? "bg-accent/15 text-accent" : "text-white/40 hover:text-white/70"
              }`}
            >
              <TerminalIcon size={12} />
              Local
            </button>
          </div>
        </div>

        {/* Profiles strip */}
        <div className="px-5 pt-3 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
              Saved Profiles
            </span>
            {kind === "ssh" && (
              <button
                onClick={handleImport}
                className="flex items-center gap-1 text-[10px] text-accent/80 hover:text-accent transition-colors"
                title="Import hosts from ~/.ssh/config"
              >
                <Download size={10} />
                Import ~/.ssh/config
              </button>
            )}
          </div>
          {profiles.filter((p) => p.kind === kind).length > 4 && (
            <div className="mb-2 flex items-center gap-1.5 px-2 py-1 bg-surface-1 border border-border rounded">
              <Search size={10} className="text-white/30" />
              <input
                type="text"
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Filter profiles..."
                className="flex-1 bg-transparent text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none"
              />
            </div>
          )}
          {importMsg && (
            <p className="mb-2 text-[10px] text-white/40">{importMsg}</p>
          )}
          {visibleProfiles.length === 0 ? (
            <div className="px-3 py-3 bg-surface-1/50 border border-dashed border-border rounded-lg text-center">
              <p className="text-[10px] text-white/30">
                No saved profiles yet. Fill in the form below and tick{" "}
                <span className="text-white/50">Save as profile</span>, or import from{" "}
                <span className="font-mono text-white/50">~/.ssh/config</span>.
              </p>
            </div>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {visibleProfiles.map((p) => {
                const isActive = activeProfileId === p.id;
                  const tagBg = p.tag && TAG_COLORS[p.tag];
                  const tip = [
                    p.kind === "ssh"
                      ? `${p.user || "?"}@${p.host || p.name}${p.port ? `:${p.port}` : ""}`
                      : "local shell",
                    p.description ? `\n${p.description}` : "",
                    p.tag ? `\n[${p.tag}]` : "",
                  ].join("");
                  return (
                    <button
                      key={p.id}
                      onClick={() => applyProfile(p)}
                      className={`group shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] transition-all ${
                        isActive
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border hover:border-border-hover hover:bg-white/[0.03] text-white/70"
                      }`}
                      title={tip}
                      style={
                        tagBg && !isActive
                          ? { borderColor: `${tagBg}80`, backgroundColor: `${tagBg}10` }
                          : undefined
                      }
                    >
                      {tagBg && (
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: tagBg }}
                        />
                      )}
                      {p.source === "ssh-config" ? (
                        <Server size={11} className="opacity-60" />
                      ) : (
                        <Star size={11} className="opacity-60" />
                      )}
                      <span className="font-medium">{p.name}</span>
                      <span
                        onClick={(e) => handleDeleteProfile(e, p.id)}
                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-opacity"
                        title="Delete profile"
                      >
                        <Trash2 size={10} />
                      </span>
                    </button>
                  );
              })}
            </div>
          )}
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {/* Session name */}
          <div>
            <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
              Session Name
            </label>
            <input
              autoFocus
              type="text"
              placeholder={kind === "local" ? "e.g. Local Shell" : "e.g. HADES Server"}
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
              Description (optional)
            </label>
            <input
              type="text"
              placeholder="What this session is for — shown in profile tooltips"
              value={config.description || ""}
              onChange={(e) =>
                setConfig({ ...config, description: e.target.value || undefined })
              }
              className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all"
            />
          </div>

          {/* Tag picker */}
          <div>
            <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
              <Tag size={10} className="inline mr-1" />
              Environment Tag
            </label>
            <div className="flex gap-1.5" title="Tagged sessions get a colored border so you can't confuse environments. Use 'prod' for anything destructive.">
              {TAG_OPTIONS.map((opt) => {
                const selected = (config.tag || "") === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() =>
                      setConfig({
                        ...config,
                        tag: opt.id || undefined,
                        color: opt.id ? opt.color : undefined,
                      })
                    }
                    className={`flex-1 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                      selected
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-border hover:border-border-hover text-white/50"
                    }`}
                    style={selected && opt.color !== "transparent" ? {
                      borderColor: opt.color,
                      backgroundColor: `${opt.color}20`,
                      color: opt.color,
                    } : undefined}
                  >
                    {opt.color !== "transparent" && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                        style={{ backgroundColor: opt.color }}
                      />
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {kind === "ssh" && (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
                    Host
                  </label>
                  <input
                    type="text"
                    placeholder="192.168.1.10 or hostname"
                    value={config.host || ""}
                    onChange={(e) => setConfig({ ...config, host: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
                    User
                  </label>
                  <input
                    type="text"
                    placeholder="user"
                    value={config.user || ""}
                    onChange={(e) => setConfig({ ...config, user: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                  />
                </div>
              </div>

              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[11px] text-white/30 hover:text-white/50 transition-colors"
              >
                {showAdvanced ? "▾ Hide advanced" : "▸ Advanced options"}
              </button>

              {showAdvanced && (
                <div className="space-y-3 pt-1">
                  <div className="flex gap-3">
                    <div className="w-24">
                      <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
                        Port
                      </label>
                      <input
                        type="number"
                        value={config.port || 22}
                        onChange={(e) =>
                          setConfig({ ...config, port: parseInt(e.target.value) || 22 })
                        }
                        className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
                        <Key size={10} className="inline mr-1" />
                        Identity File
                      </label>
                      <input
                        type="text"
                        placeholder="~/.ssh/id_rsa"
                        value={config.identity_file || ""}
                        onChange={(e) =>
                          setConfig({ ...config, identity_file: e.target.value || undefined })
                        }
                        className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
                      <FolderOpen size={10} className="inline mr-1" />
                      Project Directory (remote)
                    </label>
                    <input
                      type="text"
                      placeholder="~/projects/hades"
                      value={config.project_dir || ""}
                      onChange={(e) =>
                        setConfig({ ...config, project_dir: e.target.value || undefined })
                      }
                      className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
                      <Play size={10} className="inline mr-1" />
                      Startup Command
                    </label>
                    <input
                      type="text"
                      placeholder="claude  (or: tmux attach -t main)"
                      value={config.startup_command || ""}
                      onChange={(e) =>
                        setConfig({ ...config, startup_command: e.target.value || undefined })
                      }
                      className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                    />
                    <p className="mt-1 text-[10px] text-white/25">
                      Runs after <span className="font-mono text-white/40">cd</span>; the shell
                      relaunches when it exits so the session stays alive.
                    </p>
                  </div>

                  {/* Resilience toggles */}
                  <div className="space-y-2 pt-1 border-t border-border">
                    <label
                      className="flex items-start gap-2 cursor-pointer select-none"
                      title="Wrap connect in tmux new-session so the remote process survives network drops. Reattaches automatically on the next connect."
                    >
                      <input
                        type="checkbox"
                        checked={config.wrap_in_tmux || false}
                        onChange={(e) =>
                          setConfig({ ...config, wrap_in_tmux: e.target.checked })
                        }
                        className="accent-accent mt-0.5"
                      />
                      <div>
                        <span className="text-[12px] text-white/70 font-medium flex items-center gap-1.5">
                          <Layers size={11} />
                          Wrap in tmux
                        </span>
                        <p className="text-[10px] text-white/30 mt-0.5">
                          Survives network drops; reattach where you left off. Requires{" "}
                          <span className="font-mono">tmux</span> on the remote.
                        </p>
                      </div>
                    </label>
                    <label
                      className="flex items-start gap-2 cursor-pointer select-none"
                      title="If the PTY dies (network drop, SSH timeout), automatically respawn with exponential backoff (2s → 60s)."
                    >
                      <input
                        type="checkbox"
                        checked={config.auto_reconnect || false}
                        onChange={(e) =>
                          setConfig({ ...config, auto_reconnect: e.target.checked })
                        }
                        className="accent-accent mt-0.5"
                      />
                      <div>
                        <span className="text-[12px] text-white/70 font-medium flex items-center gap-1.5">
                          <RotateCw size={11} />
                          Auto-reconnect on drop
                        </span>
                        <p className="text-[10px] text-white/30 mt-0.5">
                          Auto-respawn the PTY with backoff. Pair with tmux to actually pick up
                          where you left off.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}

          {kind === "local" && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
                  <FolderOpen size={10} className="inline mr-1" />
                  Working Directory (optional)
                </label>
                <input
                  type="text"
                  placeholder="~/projects/my-app  (defaults to $HOME)"
                  value={config.project_dir || ""}
                  onChange={(e) =>
                    setConfig({ ...config, project_dir: e.target.value || undefined })
                  }
                  className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-white/40 mb-1 uppercase tracking-wider">
                  <Play size={10} className="inline mr-1" />
                  Startup Command (optional)
                </label>
                <input
                  type="text"
                  placeholder="claude"
                  value={config.startup_command || ""}
                  onChange={(e) =>
                    setConfig({ ...config, startup_command: e.target.value || undefined })
                  }
                  className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                />
              </div>
            </>
          )}

          {/* Save as profile */}
          <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveAsProfile}
              onChange={(e) => setSaveAsProfile(e.target.checked)}
              className="accent-accent"
            />
            <span className="text-[11px] text-white/50">
              Save as profile for next time
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-between border-t border-border bg-surface-1/50 shrink-0">
          <span className="text-[10px] text-white/20">
            {kind === "ssh"
              ? "Uses your ~/.ssh/config automatically"
              : "Local PTY — full color, login shell"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
                isValid
                  ? "bg-accent text-white hover:bg-accent-bright shadow-md shadow-accent/20"
                  : "bg-white/5 text-white/20 cursor-not-allowed"
              }`}
            >
              <Zap size={12} />
              {kind === "local" ? "Open" : "Connect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
