export type SessionKind = "ssh" | "local";
export type SessionTag = "prod" | "staging" | "dev" | "personal" | null;

export interface SessionConfig {
  name: string;
  kind?: SessionKind;
  host?: string;
  user?: string;
  port?: number;
  identity_file?: string;
  project_dir?: string;
  startup_command?: string;
  ssh_alias?: string;
  description?: string;
  tag?: string;
  color?: string;
  wrap_in_tmux?: boolean;
  auto_reconnect?: boolean;
  dangerous_command_confirm?: boolean;
  notification_level?: "all" | "errors" | "muted";
}

export type NotificationLevel = "all" | "errors" | "muted";

export interface Profile {
  id: string;
  name: string;
  kind: SessionKind;
  host?: string | null;
  user?: string | null;
  port?: number | null;
  identity_file?: string | null;
  working_directory?: string | null;
  startup_command?: string | null;
  ssh_alias?: string | null;
  description?: string | null;
  tag?: string | null;
  color?: string | null;
  wrap_in_tmux?: boolean;
  auto_reconnect?: boolean;
  dangerous_command_confirm?: boolean;
  notification_level?: string;
  created_at: string;
  /** "manual" | "ssh-config" */
  source: string;
}

/** Build a SessionConfig from a saved Profile */
export function profileToSessionConfig(p: Profile): SessionConfig {
  return {
    name: p.name,
    kind: p.kind,
    host: p.host || undefined,
    user: p.user || undefined,
    port: p.port || undefined,
    identity_file: p.identity_file || undefined,
    project_dir: p.working_directory || undefined,
    startup_command: p.startup_command || undefined,
    ssh_alias: p.ssh_alias || undefined,
    description: p.description || undefined,
    tag: p.tag || undefined,
    color: p.color || undefined,
    wrap_in_tmux: p.wrap_in_tmux || false,
    auto_reconnect: p.auto_reconnect || false,
    dangerous_command_confirm: p.dangerous_command_confirm || false,
    notification_level: (p.notification_level as any) || "all",
  };
}

/** Patterns that trigger the dangerous-command confirmation modal. */
export const DANGEROUS_PATTERNS = [
  /\brm\s+(-\w*)?r\w*\s+(-\w*\s+)*(\/|~)/i, // rm -rf /… or rm -r ~/…
  /\brm\s+(-\w*)?f\w*\s+(-\w*\s+)*(\/|~)/i,  // rm -f /…
  /\bdd\s+.*of\s*=\s*\/dev/i,                  // dd of=/dev/…
  /\bmkfs\b/i,                                  // mkfs (any variant)
  />\s*\/dev\/[sh]d/i,                          // > /dev/sda
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\binit\s+0\b/i,
  /\bkill\s+-9\s+1\b/,                         // kill PID 1
  /:\(\)\{.*\|.*&.*\};:/,                       // fork bomb
  /\bdrop\s+database\b/i,                       // SQL nuke
  /\bdrop\s+table\b/i,
];

export function isDangerousCommand(line: string): boolean {
  return DANGEROUS_PATTERNS.some((re) => re.test(line));
}

/** Tag → default color (overridable per profile via .color) */
export const TAG_COLORS: Record<string, string> = {
  prod: "#ef4444",
  staging: "#f59e0b",
  dev: "#3b82f6",
  personal: "#22c55e",
};

export function tagColor(tag?: string | null, color?: string | null): string | null {
  if (color) return color;
  if (tag && TAG_COLORS[tag]) return TAG_COLORS[tag];
  return null;
}

export type SessionStatus =
  | "Connecting"
  | "Connected"
  | "Reconnecting"
  | "Disconnected"
  | "Thinking"
  | "Writing"
  | "RunningCommand"
  | "Error"
  | "Idle";

export interface SessionInfo {
  id: string;
  config: SessionConfig;
  status: SessionStatus;
  connected_at: string | null;
  last_activity: string;
  current_task: string | null;
  bytes_received: number;
  bytes_sent: number;
  lines_processed: number;
  keep_awake: boolean;
  reconnect_count: number;
}

/** Compact human duration: 45s, 12m, 3h 5m, 2d 4h */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** Compact bytes: 12 B, 3.4 KB, 8.1 MB */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export interface SessionOutput {
  session_id: string;
  data: string;
}

export interface StatusUpdate {
  session_id: string;
  status: SessionStatus;
  task: string | null;
  timestamp: string;
}

export interface LayoutPreset {
  id: string;
  name: string;
  icon: string;
  cols: number;
  maxPerRow: number;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: "focus", name: "Focus", icon: "maximize", cols: 1, maxPerRow: 1 },
  { id: "split", name: "Split", icon: "columns", cols: 2, maxPerRow: 2 },
  { id: "grid", name: "Grid", icon: "grid", cols: 2, maxPerRow: 2 },
  { id: "monitor", name: "Monitor", icon: "layout-grid", cols: 3, maxPerRow: 3 },
];

export const STATUS_COLORS: Record<SessionStatus, string> = {
  Connecting: "#f0c674",
  Connected: "#b5bd68",
  Reconnecting: "#f0c674",
  Disconnected: "#cc6666",
  Thinking: "#f0c674",
  Writing: "#81a2be",
  RunningCommand: "#b294bb",
  Error: "#cc6666",
  Idle: "#969896",
};

export const STATUS_LABELS: Record<SessionStatus, string> = {
  Connecting: "Connecting...",
  Connected: "Connected",
  Reconnecting: "Reconnecting...",
  Disconnected: "Disconnected",
  Thinking: "Thinking",
  Writing: "Writing Code",
  RunningCommand: "Running",
  Error: "Error",
  Idle: "Idle",
};

/** Format the host display string for a session — handles local vs SSH */
export function sessionHostLabel(config: SessionConfig): string {
  if (config.kind === "local") {
    return config.project_dir ? `local · ${config.project_dir}` : "local shell";
  }
  if (config.host && config.user) return `${config.user}@${config.host}`;
  return config.host || "—";
}
