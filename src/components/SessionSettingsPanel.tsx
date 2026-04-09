import { useState } from "react";
import { X, Shield, Bell, RotateCw, Layers, Tag } from "lucide-react";
import { useSession } from "../hooks/useSession";
import { TAG_COLORS, type SessionInfo, type NotificationLevel } from "../types";

interface SessionSettingsPanelProps {
  session: SessionInfo;
  onClose: () => void;
}

const TAG_OPTIONS = [
  { id: "", label: "None" },
  { id: "personal", label: "Personal" },
  { id: "dev", label: "Dev" },
  { id: "staging", label: "Staging" },
  { id: "prod", label: "Prod" },
];

const NOTIF_OPTIONS: Array<{ id: NotificationLevel; label: string; desc: string }> = [
  { id: "all", label: "All", desc: "Notify on every status change" },
  { id: "errors", label: "Errors only", desc: "Only on Error / Disconnect" },
  { id: "muted", label: "Muted", desc: "No notifications from this session" },
];

export function SessionSettingsPanel({ session, onClose }: SessionSettingsPanelProps) {
  const { updateConfig, setKeepAwake } = useSession();
  const c = session.config;

  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description || "");
  const [tag, setTag] = useState(c.tag || "");
  const [customColor, setCustomColor] = useState(c.color || "");
  const [dangerousConfirm, setDangerousConfirm] = useState(c.dangerous_command_confirm || false);
  const [notifLevel, setNotifLevel] = useState<NotificationLevel>(
    (c.notification_level as NotificationLevel) || "all"
  );
  const [autoReconnect, setAutoReconnect] = useState(c.auto_reconnect || false);
  const [wrapTmux, setWrapTmux] = useState(c.wrap_in_tmux || false);

  const save = () => {
    updateConfig(session.id, {
      name: name.trim() || c.name,
      description: description || undefined,
      tag: tag || undefined,
      color: customColor || (tag ? TAG_COLORS[tag] : undefined),
      dangerous_command_confirm: dangerousConfirm,
      notification_level: notifLevel,
      auto_reconnect: autoReconnect,
      wrap_in_tmux: wrapTmux,
    });
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-start justify-end pt-9 pr-1"
      onClick={onClose}
    >
      <div
        className="w-72 bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 flex items-center justify-between border-b border-border">
          <span className="text-[12px] font-semibold text-white/80">Session Settings</span>
          <button
            onClick={onClose}
            className="p-0.5 rounded text-white/40 hover:text-white/70 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-[10px] font-medium text-white/40 mb-1 uppercase tracking-wider">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2 py-1.5 bg-surface-0 border border-border rounded text-[12px] text-white/90 focus:outline-none focus:border-accent/40 transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-medium text-white/40 mb-1 uppercase tracking-wider">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this session is for"
              className="w-full px-2 py-1.5 bg-surface-0 border border-border rounded text-[12px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-accent/40 transition-all"
            />
          </div>

          {/* Tag */}
          <div>
            <label className="block text-[10px] font-medium text-white/40 mb-1 uppercase tracking-wider">
              <Tag size={9} className="inline mr-1" />
              Tag
            </label>
            <div className="flex flex-wrap gap-1">
              {TAG_OPTIONS.map((opt) => {
                const color = TAG_COLORS[opt.id];
                const active = tag === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setTag(opt.id);
                      if (color) setCustomColor(color);
                      else setCustomColor("");
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                      active
                        ? "border-white/30 text-white"
                        : "border-border text-white/50 hover:border-border-hover"
                    }`}
                    style={active && color ? { borderColor: color, color } : undefined}
                  >
                    {color && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                        style={{ backgroundColor: color }}
                      />
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              placeholder="#ef4444 (custom hex)"
              className="mt-1.5 w-full px-2 py-1 bg-surface-0 border border-border rounded text-[10px] font-mono text-white/70 placeholder:text-white/20 focus:outline-none focus:border-accent/40"
              title="Override the tag color with any hex value"
            />
          </div>

          {/* Dangerous command confirmation */}
          <label
            className="flex items-start gap-2 cursor-pointer select-none"
            title="When on, intercepting dangerous commands like rm -rf, dd, mkfs before they run. You'll need to type the session name to confirm."
          >
            <input
              type="checkbox"
              checked={dangerousConfirm}
              onChange={(e) => setDangerousConfirm(e.target.checked)}
              className="accent-accent mt-0.5"
            />
            <div>
              <span className="text-[11px] text-white/70 font-medium flex items-center gap-1.5">
                <Shield size={10} />
                Dangerous command guard
              </span>
              <p className="text-[9px] text-white/30 mt-0.5">
                Intercept rm -rf, dd, mkfs, DROP TABLE… and ask for confirmation before sending.
              </p>
            </div>
          </label>

          {/* Notification level */}
          <div>
            <label className="block text-[10px] font-medium text-white/40 mb-1 uppercase tracking-wider">
              <Bell size={9} className="inline mr-1" />
              Notifications
            </label>
            <div className="flex gap-1">
              {NOTIF_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setNotifLevel(opt.id)}
                  title={opt.desc}
                  className={`flex-1 px-2 py-1 rounded text-[10px] font-medium border transition-all ${
                    notifLevel === opt.id
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border text-white/50 hover:border-border-hover"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-reconnect */}
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoReconnect}
              onChange={(e) => setAutoReconnect(e.target.checked)}
              className="accent-accent mt-0.5"
            />
            <div>
              <span className="text-[11px] text-white/70 font-medium flex items-center gap-1.5">
                <RotateCw size={10} />
                Auto-reconnect on drop
              </span>
              <p className="text-[9px] text-white/30 mt-0.5">
                Respawn PTY automatically if the connection dies.
              </p>
            </div>
          </label>

          {/* Wrap in tmux */}
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={wrapTmux}
              onChange={(e) => setWrapTmux(e.target.checked)}
              className="accent-accent mt-0.5"
            />
            <div>
              <span className="text-[11px] text-white/70 font-medium flex items-center gap-1.5">
                <Layers size={10} />
                Wrap in tmux
              </span>
              <p className="text-[9px] text-white/30 mt-0.5">
                Takes effect on next reconnect. Requires tmux on the remote.
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 flex justify-end gap-2 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1 text-[11px] text-white/50 hover:text-white/70 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-3 py-1 text-[11px] font-medium rounded bg-accent text-white hover:bg-accent-bright transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
