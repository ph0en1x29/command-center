# Command Center

[![CI](https://github.com/ph0en1x29/command-center/actions/workflows/ci.yml/badge.svg)](https://github.com/ph0en1x29/command-center/actions/workflows/ci.yml)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-blue?logo=tauri)](https://v2.tauri.app)
[![React 18](https://img.shields.io/badge/React-18-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

A native macOS desktop application for managing multiple SSH and local terminal sessions with built-in Claude Code awareness. Built with Tauri 2 (Rust) and React.

Command Center gives you a single pane of glass for running Claude Code across many machines at once. It tracks what each session is doing (Thinking, Writing, Running Command, Idle, Error), sends native macOS notifications on state changes, and provides six layout modes so you can arrange sessions however your workflow demands.

<!-- Add a screenshot or GIF here — this is the single most impactful thing for discoverability.
     Capture the app in Grid or Monitor layout with a few sessions running Claude Code.
     Recommended: GIF (20-30s demo) or PNG (1280x800+).
     Place the image in an assets/ directory and reference it like:
     ![Command Center](assets/screenshot.png)
-->

---

## Features

### Terminal Sessions

- **SSH and local terminals** via the `portable-pty` crate -- real PTY allocation with full line editing, cursor movement, colors, and window size reporting
- **Claude Code status detection** -- line-by-line parser in Rust recognizes Thinking, Writing, Running Command, Error, and Idle states from terminal output
- **xterm.js 5 with WebGL rendering** -- hardware-accelerated terminal emulation with Ghostty color theme, 10,000-line scrollback, clickable URLs, and `macOptionIsMeta`
- **Automatic PTY resize** -- terminals resize when panels or the window change size via `ResizeObserver` and `ioctl`
- **TERM=xterm-256color forced on remote** -- SSH remote command exports `TERM` and `COLORTERM` so TUI apps get full color support regardless of server `AcceptEnv` settings

### Six Layout Modes

| Shortcut | Layout  | Description                                       |
|----------|---------|---------------------------------------------------|
| Cmd+1    | Focus   | Single full-bleed terminal                        |
| Cmd+2    | Split   | Two side-by-side with a draggable vertical divider |
| Cmd+3    | Stack   | Two stacked top/bottom with a draggable horizontal divider |
| Cmd+4    | Grid    | 2x2 with independent row and column drag handles |
| Cmd+5    | Free    | Drag and resize panels anywhere on a 12-column snap grid |
| Cmd+6    | Monitor | Auto-tile every session for at-a-glance overview  |

Split, Stack, and Grid use `react-resizable-panels` with auto-saved divider positions. Free uses `react-grid-layout` with per-session position persistence in localStorage.

### Profiles and SSH Config Import

- **Persistent profiles** stored at `~/Library/Application Support/com.jay.commandcenter/profiles.json`
- **One-click SSH config import** -- parses `~/.ssh/config` Host blocks (HostName, User, Port, IdentityFile), skips wildcards, deduplicates by name
- **ssh_alias support** -- imported profiles invoke `ssh <alias>` instead of `ssh user@host`, so `UseKeychain`, `ProxyJump`, `ControlMaster`, and other directives are honored
- **Startup commands** -- typed into the PTY after the shell is connected (500ms delay for `.zshrc` to load), so shell aliases and functions work
- **Profile search/filter** in the New Session modal when the list exceeds 4 entries
- **Save as profile** checkbox to persist any ad-hoc session

### Session Resilience

- **Keep-awake heartbeat** -- per-session NUL byte every 30 seconds (background Rust thread) to prevent NAT timeout, sshd `ClientAliveInterval`, and shell `$TMOUT` disconnects
- **tmux wrapping** -- wraps the connect command in `tmux new-session -A -s cc_<name>` so the remote process survives network drops; graceful fallback to plain shell if tmux is not installed
- **Auto-reconnect with exponential backoff** -- 2s doubling to 60s max; respawns the PTY, replaces the writer/master in the session handle, increments the reconnect counter
- **SSH hardening** -- all connections include `-o ServerAliveInterval=30 -o ServerAliveCountMax=3` and `-t` for forced TTY allocation
- **Sleep guard** -- snapshots connected sessions on `visibilitychange` hidden; on visible, checks for drops and fires a native notification summarizing what disconnected

### Color Tags and Production Safety

- **Environment tags** -- `prod` (red), `staging` (amber), `dev` (blue), `personal` (green) shown as colored pills in the sidebar, panel header, and overview panel
- **Custom hex color picker** -- override any tag's default color with an arbitrary hex value
- **Dangerous command guard** -- regex-based interception of destructive commands before Enter reaches the shell: `rm -rf /`, `dd of=/dev/`, `mkfs`, `shutdown`, `reboot`, `kill -9 1`, `DROP DATABASE`, `DROP TABLE`, fork bombs, and more
- **Type-session-name-to-confirm modal** -- must type the exact session name to proceed; Cancel sends Ctrl+C to clear the line

### Notifications and System Integration

- **Native macOS notifications** via `tauri-plugin-notification`: Error, unexpected disconnect, successful reconnect, and Claude finishing a task (when notification level is "all")
- **Per-session notification levels** -- All, Errors only, or Muted; capped at 5 notifications per session to prevent flood
- **Dock badge** -- shows count of sessions in Error or Thinking state
- **Menu bar tray icon** -- live list of all sessions with status glyphs, click to switch; "Show Window", "New Session...", and "Quit" actions; auto-refreshes every 2 seconds
- **App stays alive in tray** when all windows are closed (`ExitRequested` prevention)

### Broadcast Mode

Toggle with Cmd+Shift+B or the Broadcast button in the layout bar. Keystrokes typed into any targeted panel are mirrored to all other targets via parallel Tauri `write_to_session` invocations. Targeted panels get a red ring and "BROADCAST" badge. The status bar shows "BCAST N".

### Scrollback Transcripts

- Every session is silently transcribed to `~/Library/Application Support/com.jay.commandcenter/transcripts/<id>.log`
- 5 MB cap with front-truncation (keeps the most recent 1 MB)
- **Markdown export to clipboard** -- click the copy icon in the panel header

### UI

- **Ghostty terminal theme** -- dark color scheme from the Ghostty terminal emulator, applied to both xterm.js and Tailwind surface/accent tokens
- **Custom macOS title bar** -- overlay style with native traffic lights and a draggable region
- **Collapsible sidebar** (Cmd+\\) -- session list with status dots, uptime, host label, tag pills, eye/close buttons; collapsed mode shows just status dots
- **Multi-select in sidebar** -- enter select mode for bulk close of multiple sessions at once
- **Quick local terminal** (Cmd+T) -- opens a local shell instantly with an auto-generated name, no modal
- **Auto-naming** -- sessions get names like "Terminal N" (local) or "hostname N" (SSH) when the name field is left blank
- **Overview panel** (Cmd+Shift+O) -- right-side panel with compact session status cards
- **Status bar** -- connected/total counts, SSH/local breakdowns, keep-awake count, error count, active session info, layout mode, traffic stats, broadcast indicator, and clock
- **Activity-since-viewed badge** -- panels not in focus show "+N KB" when new output arrives; click to dismiss
- **In-session settings editing** -- gear icon overlay to edit name, description, tag, color, dangerous command guard, notification level, auto-reconnect, and tmux wrapping on a live session
- **Close session confirmation modal** -- warns when a session is actively running (Thinking/Writing/RunningCommand) and mentions tmux if enabled
- **Help panel** (Cmd+?) -- comprehensive docs with Quick Start, Layouts, Profiles, Color Tags, Broadcast, Keep Awake, Network Resilience, Notifications, Activity Badge, Export, and Keyboard Shortcuts

---

## Installation

### From Release

Download the latest `.dmg` or `.app.zip` from the [Releases](https://github.com/ctrl-technologies/command-center/releases) page.

1. Open the `.dmg` and drag **Command Center** to your Applications folder, or unzip the `.app.zip`
2. On first launch, macOS may show a Gatekeeper warning -- right-click the app and select "Open" to bypass it
3. Grant Notifications permission when prompted (for session state alerts)

### From Source

Prerequisites:
- **Rust** (latest stable) -- install via [rustup](https://rustup.rs/)
- **Node.js** >= 18
- **Xcode Command Line Tools** -- `xcode-select --install`

```bash
git clone https://github.com/ctrl-technologies/command-center.git
cd command-center

# Install frontend dependencies
npm install

# Run in development mode (Vite dev server on :1420 + Tauri window with hot reload)
npm run tauri dev

# Build a production .app bundle and .dmg installer
npm run tauri build
```

The production build outputs to `src-tauri/target/release/bundle/`. The `.app` bundle is in the `macos/` subdirectory and the `.dmg` is in `dmg/`.

### Type Checking Only

```bash
npx tsc --noEmit
```

---

## Keyboard Shortcuts

| Shortcut       | Action                                         |
|----------------|-------------------------------------------------|
| Cmd+N          | New session modal                               |
| Cmd+T          | Quick local terminal (no modal)                 |
| Cmd+?          | Toggle help panel                               |
| Cmd+1          | Focus layout                                    |
| Cmd+2          | Split layout                                    |
| Cmd+3          | Stack layout                                    |
| Cmd+4          | Grid layout                                     |
| Cmd+5          | Free layout                                     |
| Cmd+6          | Monitor layout                                  |
| Cmd+\\         | Toggle sidebar                                  |
| Cmd+Shift+O    | Toggle overview panel                           |
| Cmd+Shift+B    | Toggle broadcast mode                           |

---

## Project Structure

```
command-center/
  src/
    App.tsx                        Root component, event wiring, keyboard shortcuts
    types/index.ts                 TypeScript types, constants, dangerous command patterns, tag colors
    store/sessions.ts              Zustand store for session state
    store/profiles.ts              Zustand store for profile CRUD + SSH config import
    hooks/useSession.ts            Tauri command wrappers (create, write, resize, close, keep-awake, config, transcript)
    hooks/useTerminal.ts           xterm.js setup with Ghostty theme, WebGL, FitAddon, WebLinksAddon
    hooks/useTick.ts               Interval-based re-render trigger for live durations
    components/
      TitleBar.tsx                 Custom macOS title bar with drag region
      Sidebar.tsx                  Session list with status, multi-select, visibility toggles
      LayoutBar.tsx                Layout mode switcher, broadcast toggle, overview toggle
      TerminalGrid.tsx             Layout engine (Focus/Split/Stack/Grid/Monitor)
      FreeLayout.tsx               Drag-and-resize layout via react-grid-layout
      TerminalPanel.tsx            Single terminal: header, xterm, settings, dangerous command interception
      OverviewPanel.tsx            Right-side session status cards
      StatusBar.tsx                Bottom bar with stats, traffic, layout, clock
      NewSessionModal.tsx          Session creation form with profile picker and SSH config import
      SessionSettingsPanel.tsx     Live settings editor for running sessions
      DangerousCommandModal.tsx    Type-session-name confirmation for destructive commands
      CloseSessionModal.tsx        Close confirmation with active-session warning
      HelpPanel.tsx                Help overlay with feature docs and shortcut reference
      StatusDot.tsx                Animated status indicator dot
  src-tauri/
    src/lib.rs                     Rust backend: PTY management, SSH/local commands, session lifecycle,
                                   auto-reconnect, keep-awake, Claude status parser, tray, notifications,
                                   transcripts
    src/profiles.rs                Profile storage, ssh_config parser, Tauri commands
    src/main.rs                    Entry point (calls lib::run)
    tauri.conf.json                Window size, title bar style, bundle settings
    Cargo.toml                     Rust dependencies
  package.json                     Frontend dependencies and scripts
  tailwind.config.js               Tailwind CSS configuration
  vite.config.ts                   Vite configuration
```

---

## Tech Stack

| Layer         | Technology                                                          |
|---------------|---------------------------------------------------------------------|
| Runtime       | Tauri 2 (Rust backend, WebView frontend)                           |
| Frontend      | React 18, TypeScript 5, Vite 5, Tailwind CSS 3                    |
| Terminal      | xterm.js 5 with WebGL addon, FitAddon, WebLinksAddon              |
| State         | Zustand 4                                                           |
| Layouts       | react-resizable-panels (Split/Stack/Grid), react-grid-layout (Free) |
| PTY           | portable-pty 0.8                                                    |
| Notifications | tauri-plugin-notification                                           |
| Icons         | Lucide React                                                        |

---

## Security Model

**What Command Center touches:**

- **SSH keys** -- passes `-i <path>` to the `ssh` command; never reads, copies, or stores your private keys
- **SSH agent** -- forwards `SSH_AUTH_SOCK` to SSH subprocesses for agent-based auth
- **~/.ssh/config** -- the import feature reads this file to parse Host blocks; never writes to it
- **PTY access** -- each session spawns a real PTY running with your user permissions
- **Transcript files** -- raw terminal output is logged to the app data directory; these may contain sensitive output

**What Command Center does NOT do:**

- Store passwords or passphrases
- Modify your SSH keys or SSH config
- Make any network requests beyond the SSH connections you configure
- Run with elevated privileges
- Access the macOS Keychain directly (your SSH config may reference it via `UseKeychain`)

---

## Contributing

Contributions are welcome. To get started:

1. Fork the repository and create a feature branch
2. Run `npm install` and `npm run tauri dev` to start the development environment
3. Make your changes -- the Vite dev server provides hot reload for the React frontend; Rust changes require a restart
4. Run `npx tsc --noEmit` to verify TypeScript types
5. Open a pull request with a clear description of what changed and why

Please read `CLAUDE.md` for architecture context, design decisions, and known gotchas before making changes to the backend or event system.

### Areas Where Help Is Appreciated

- Linux and Windows platform support
- Automated tests (Rust unit tests, React component tests)
- Accessibility improvements
- Additional terminal themes
- Documentation translations

---

## Roadmap

These are ideas under consideration, not commitments:

- Session groups for batch operations
- Sidebar search/filter
- Configurable terminal themes
- Session templates (pre-configured bundles)
- Multi-window support (detach panels)
- Session recording/playback with timing
- Plugin system for status parsers
- Linux and Windows builds
- Drag-and-drop sidebar reordering
- Panel splitting within the current layout
- Claude Code MCP protocol integration for richer status

---

## License

This project is licensed under the [MIT License](LICENSE).
