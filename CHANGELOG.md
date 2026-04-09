# Changelog

All notable changes to Command Center are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [26.4.9] - 2026-04-09

### Fixed

- **Terminal text overlap / display corruption**: moved CSS padding from `.xterm` to the parent wrapper div so the WebGL canvas and FitAddon both measure from a clean content box. Added `width: 100%` and `height: 100%` on `.xterm` and `.xterm-screen`. Every `fit()` call now forces an xterm.js font re-measure (`fontFamily` re-assignment) to catch late web-font swaps. Initial fit waits for `document.fonts.ready` before computing the grid — mirroring Ghostty's approach.
- **Double startup command entry**: prompt detection now strips ANSI escape sequences before checking for prompt suffixes (`$`, `%`, `>`, `#`), only inspects the last line, and adds a 150ms delay so readline/zle finishes initialising before the command is typed.
- **Session close leaves orphan processes / won't exit**: closing a session now: (1) sends `tmux kill-session` if tmux wrapping is active to destroy the remote session, (2) sends Ctrl-C + `exit`, (3) kills the entire process group via `SIGHUP`+`SIGTERM` (not just the child PID), (4) reaps the zombie in a background thread. This prevents new sessions from reattaching to a stale tmux session.

## [0.1.0] - 2026-04-09

Initial public release.

### Terminal Engine

- PTY management via the `portable-pty` crate with real pseudo-terminal allocation, `ioctl` resize, and full-color support
- SSH sessions with configurable host, user, port, identity file, remote project directory, startup command, and ssh_alias
- Local terminal sessions using the user's login shell with explicit environment propagation (PATH, HOME, USER, LANG, TERM=xterm-256color, COLORTERM=truecolor)
- SSH alias support: profiles imported from `~/.ssh/config` connect via `ssh <alias>` so all directives (UseKeychain, ProxyJump, ControlMaster, etc.) are honored
- SSH hardening: forced TTY allocation (`-t`), `ServerAliveInterval=30`, `ServerAliveCountMax=3`, `SSH_AUTH_SOCK` forwarding
- TERM=xterm-256color forced on remote via SSH remote command (`export TERM=xterm-256color COLORTERM=truecolor`) since sshd `AcceptEnv` typically blocks these
- xterm.js 5 terminal emulation with WebGL rendering (automatic canvas fallback), Ghostty color theme, 10,000-line scrollback, clickable URLs (WebLinksAddon), and `macOptionIsMeta`
- Claude Code output parser in Rust: line-by-line detection of Thinking, Writing, Running Command, Error, and Idle states by matching spinner characters, "Edit:", "Write:", "Execute:", "Bash:", "Tool:", and "Error:" prefixes
- Real-time event system: Rust backend emits `session-output` and `session-status` events; React frontend routes output to the correct xterm instance via a ref-based handler registry

### Layouts

- Six layout modes: Focus, Split, Stack, Grid, Free, and Monitor
- Focus: single full-bleed terminal panel
- Split: two terminals side by side with a draggable vertical divider (`react-resizable-panels`)
- Stack: two terminals stacked vertically with a draggable horizontal divider
- Grid: 2x2 layout with independent row and column drag handles via nested PanelGroups
- Free: drag-and-resize layout using `react-grid-layout` on a 12-column snap grid; panel positions persist to localStorage per session ID with garbage collection of stale entries
- Monitor: auto-tiling CSS grid that displays every session; adapts from 2-column to 3-column based on session count
- Divider positions auto-save to localStorage via `autoSaveId` (Split, Stack, Grid)
- Keyboard shortcuts Cmd+1 through Cmd+6 to switch layouts

### Profiles

- Persistent profile storage at `~/Library/Application Support/com.jay.commandcenter/profiles.json`
- Profile CRUD via Tauri commands: `list_profiles`, `save_profile`, `delete_profile`
- SSH config import: `import_ssh_config` reads `~/.ssh/config`, parses Host blocks (HostName, User, Port, IdentityFile), skips wildcard patterns, deduplicates by name, merges into the profile list
- Imported profiles set `ssh_alias` to the Host alias for full ssh_config directive support
- Profile picker in the New Session modal with clickable chips
- Profile search/filter when the list exceeds 4 entries
- Save-as-profile checkbox for ad-hoc sessions
- Inline profile deletion on hover
- Each profile stores: name, kind, host, user, port, identity_file, working_directory, startup_command, ssh_alias, description, tag, color, wrap_in_tmux, auto_reconnect, dangerous_command_confirm, notification_level, created_at, source

### Session Resilience

- Keep-awake heartbeat: background Rust thread sends a NUL byte every 30 seconds to sessions with keep_awake enabled; toggled via coffee icon in panel header
- Auto-reconnect with exponential backoff: on PTY EOF or read error, sleeps 2s doubling to 60s max, spawns a fresh PTY, replaces the writer/master in the session handle, increments `reconnect_count`
- Reconnect counter displayed in panel header when greater than zero
- tmux wrapping: connect command becomes `command -v tmux >/dev/null && tmux new-session -A -s cc_<slug> || exec $SHELL -l` for both SSH and local sessions; graceful fallback if tmux is not installed
- Startup commands: typed into the PTY 500ms after the shell reports Connected, so aliases and functions from `.zshrc` / `.bashrc` are available
- Sleep guard: snapshots connected sessions on `visibilitychange` hidden; on visible, detects dropped sessions and fires a native notification with the list of names

### Color Tags and Safety

- Environment tags: prod (red #ef4444), staging (amber #f59e0b), dev (blue #3b82f6), personal (green #22c55e)
- Tags shown as colored pills in the sidebar, panel header, and overview panel
- Custom hex color override per profile or live session
- Dangerous command guard: regex-based interception before Enter reaches the shell
  - Matches: `rm -rf /`, `rm -f /`, `dd of=/dev/`, `mkfs`, `> /dev/sda`, `shutdown`, `reboot`, `init 0`, `kill -9 1`, fork bomb pattern, `DROP DATABASE`, `DROP TABLE`
- Confirmation modal requires typing the exact session name; Cancel sends Ctrl+C to clear the shell line
- Per-session toggle without restart

### Notifications and System Integration

- Native macOS notifications via `tauri-plugin-notification` on Error, unexpected disconnect, successful reconnect, and Claude finishing a task (Thinking/Writing/RunningCommand to Idle when level is "all")
- Per-session notification levels: all, errors, muted
- Notification cap: 5 notifications per session lifetime to prevent flood from oscillating error output
- Dock badge: count of sessions in Error or Thinking state
- Menu bar tray icon with live session list, status glyphs, current task (truncated to 32 chars), "Show Window", "New Session...", and "Quit Command Center"
- Tray menu auto-refreshes every 2 seconds
- App stays alive in tray when all windows are closed (ExitRequested prevention)

### Broadcast Mode

- Toggle via Cmd+Shift+B or the Broadcast button in the layout bar
- Targets set to focused sessions (if any) or all sessions
- Keystrokes mirrored to all targets via parallel `write_to_session` invocations
- Visual indicators: red border, "BROADCAST" corner badge, pulsing radio icon, "BCAST N" in status bar

### Scrollback Transcripts

- Every session transcribed to `~/Library/Application Support/com.jay.commandcenter/transcripts/<id>.log`
- 5 MB cap with front-truncation (keeps most recent 1 MB); checked every 200 write batches
- Transcript files deleted when sessions are closed
- Markdown export to clipboard via copy icon in panel header

### UI/UX

- Ghostty terminal color theme applied to xterm.js and Tailwind surface/border/accent tokens
- Custom macOS title bar: `titleBarStyle: "Overlay"` with `hiddenTitle: true`
- Collapsible sidebar (Cmd+\\): expanded mode with session list, status dots, current task, uptime, host label, eye/close buttons; collapsed mode with just status dots
- Multi-select mode in sidebar for bulk close of multiple sessions
- Quick local terminal (Cmd+T): instant local shell with auto-generated name, no modal
- Auto-naming: "Terminal N" for local sessions, "hostname N" for SSH sessions when name is left blank
- Layout bar: six mode buttons with icons and tooltips, broadcast toggle, visible/total count, overview panel toggle
- Overview panel (Cmd+Shift+O): right-side compact session status cards with tag pills
- Status bar: connected/total counts, SSH/local breakdowns, keep-awake count, error count, active session info, layout mode, total bytes received/sent, broadcast indicator, clock
- Activity-since-viewed badge: "+N KB" on inactive panels when new output arrives; click to dismiss
- In-session settings panel (gear icon overlay): edit name, description, tag, custom hex color, dangerous command guard, notification level, auto-reconnect, tmux wrapping on live sessions
- Close session confirmation modal: warns when session is actively running (Thinking/Writing/RunningCommand); mentions tmux if enabled
- Help panel (Cmd+?): Quick Start, Layouts, Profiles, Color Tags, Broadcast, Keep Awake, Network Resilience, Notifications, Activity Badge, Export, and Keyboard Shortcuts
- StatusDot component: animated pulsing for Thinking, Connecting, RunningCommand; static for other states
- New Session modal: SSH/Local tabs, profile strip, description field, tag picker, advanced options (port, identity file, project dir, startup command, tmux, auto-reconnect)

### State Management

- Zustand session store: sessions Map, activeSessionId, focusedSessionIds, layoutMode, sidebarOpen, broadcastMode, broadcastTargets, lastSeenBytes for activity badges
- Zustand profile store: wraps Tauri profile commands with loading/error state
- useSession hook: wraps all Tauri invoke calls with broadcast fan-out logic
- useTerminal hook: xterm.js lifecycle with Ghostty theme, WebGL addon (with context-loss recovery and fallback), FitAddon, WebLinksAddon, font-ready gating
- useTick hook: interval-based re-render trigger for live duration displays
