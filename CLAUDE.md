# CLAUDE.md -- Development Context for Command Center

This file provides context for contributors and future Claude Code sessions working on this repository.

---

## Project Overview

Command Center is a native macOS desktop application for managing multiple SSH and local terminal sessions, with built-in awareness of Claude Code's output states. It is built with:

- **Tauri 2** (Rust backend, WebView frontend)
- **React 18** with TypeScript
- **Vite 5** for bundling
- **Tailwind CSS 3** for styling
- **xterm.js 5** for terminal emulation (WebGL-accelerated with canvas fallback)
- **Zustand 4** for state management
- **react-resizable-panels** for Split/Stack/Grid layouts
- **react-grid-layout** for Free layout
- **portable-pty 0.8** for PTY management in Rust
- **tauri-plugin-notification** for native macOS notifications
- **Lucide React** for icons
- **date-fns** for time formatting

The app identifier is `com.jay.commandcenter`. The current version is 0.1.0.

---

## How to Build and Run

### Development

```bash
npm install
npm run tauri dev
```

This starts the Vite dev server on port 1420 and launches the Tauri development window with hot reload. React changes are instant; Rust changes trigger a recompile and restart.

### Production

```bash
npm run tauri build
```

Outputs to `src-tauri/target/release/bundle/`. Produces a `.app` bundle (`macos/`) and a `.dmg` installer (`dmg/`).

### Type checking only (no build)

```bash
npx tsc --noEmit
```

---

## Architecture Overview

### Rust Backend (`src-tauri/src/`)

**lib.rs** -- the main module, approximately 1080 lines. Contains:

- **Type definitions**: `SessionConfig` (all connection parameters + toggles), `SessionStatus` (enum with 9 variants: Connecting, Connected, Reconnecting, Disconnected, Thinking, Writing, RunningCommand, Error, Idle), `SessionInfo` (runtime session state including bytes, uptime, keep_awake, reconnect_count), `SessionOutput`, `StatusUpdate`
- **SessionHandle** struct: holds `SessionInfo`, PTY writer (`Box<dyn Write + Send>`), master PTY reference (`Box<dyn MasterPty + Send>`), and child process (`Box<dyn Child + Send>`)
- **AppState**: `Mutex<HashMap<String, SessionHandle>>` managing all active sessions; wrapped in `Arc` and shared across threads
- **`build_ssh_command()`**: constructs a `CommandBuilder` for SSH with `-t`, `ServerAliveInterval`, `SSH_AUTH_SOCK` forwarding, ssh_alias support, and a remote command that exports `TERM=xterm-256color COLORTERM=truecolor`, optionally `cd`s to a project dir, and optionally wraps in tmux (with graceful fallback)
- **`build_local_command()`**: constructs a login shell (`$SHELL -l`) with explicit env vars (HOME, PATH, USER, LANG, TERM, COLORTERM), optional `cwd`, optional tmux wrapping
- **`spawn_pty()`**: opens a PTY pair via `native_pty_system()`, spawns the command, returns (master, writer, reader)
- **`detect_claude_status()`**: line-by-line parser matching spinner chars, "Edit:", "Write:", "Execute:", "Bash:", "Tool:", "Error:" prefixes to `SessionStatus` variants
- **`run_session_loop()`**: spawns a background thread per session that: reads from the PTY in 4KB chunks, appends to transcript file, emits `session-output` events, transitions Connecting->Connected on first output, fires startup_command 500ms after Connected, runs line-buffered Claude status parsing, handles auto-reconnect with exponential backoff (2s->60s), fires notifications on status transitions
- **`spawn_keep_awake_ticker()`**: background thread that wakes every 30s and writes a NUL byte to every session with `keep_awake == true`
- **`build_tray_menu()` / `spawn_tray_updater()`**: system tray with live session list rebuilt every 2s; status glyphs per session; menu events for show, new, quit, and session switching
- **`notify_status_transition()`**: fires native macOS notifications on Error, disconnect, reconnect, and Claude-idle transitions; respects notification_level and caps at 5 per session
- **Transcript management**: `transcript_path()` resolves to `<app_data_dir>/transcripts/<id>.log`; `maybe_truncate()` front-truncates to 1 MB when file exceeds 5 MB; checked every 200 write batches
- **Tauri commands**: `create_session`, `write_to_session`, `resize_session`, `close_session`, `list_sessions`, `get_session`, `set_keep_awake`, `update_session_config`, `read_transcript`
- **`run()` function**: initializes Tauri with plugins, manages state, hydrates profiles from disk, sets up tray and background workers, registers all commands, handles `ExitRequested` to keep app alive in tray

**profiles.rs** -- profile persistence and SSH config parsing:

- `Profile` struct with all connection fields plus metadata (`source`: "manual" | "ssh-config", `created_at`)
- `ProfileStore`: `Mutex<Vec<Profile>>` managed as Tauri state
- `profiles_path()`: resolves to `<app_data_dir>/profiles.json`
- `load()` / `persist()`: read/write JSON
- `parse_ssh_config()`: minimal `ssh_config(5)` parser handling Host blocks, HostName, User, Port, IdentityFile; skips wildcard patterns (`*`, `?`, `!`); takes only the first alias from multi-alias Host lines
- Tauri commands: `list_profiles`, `save_profile`, `delete_profile`, `import_ssh_config` (reads `~/.ssh/config`, deduplicates by name, merges)

### React Frontend (`src/`)

**App.tsx** -- root component:
- Sets up event listeners for `session-output`, `session-status`, `activate-session`, `tray-new-session` (with StrictMode double-mount protection via `cancelled` flag)
- Manages the output handler registry (`outputHandlers` ref: `Map<string, (data: string) => void>`)
- Keyboard shortcuts: Cmd+N (new session), Cmd+T (quick local terminal), Cmd+\\ (toggle sidebar), Cmd+Shift+O (toggle overview), Cmd+1-6 (layouts), Cmd+Shift+B (broadcast), Cmd+? (help)
- Dock badge logic: counts Error + Thinking sessions, sets badge via `getCurrentWindow().setBadgeLabel()`
- Sleep guard: snapshots connected session IDs on `visibilitychange` hidden, checks for drops on visible, fires native Notification
- Renders: TitleBar, Sidebar, LayoutBar, TerminalGrid, OverviewPanel, StatusBar, and modals (NewSessionModal, HelpPanel, CloseSessionModal)

**store/sessions.ts** -- Zustand store:
- `sessions`: `Map<string, SessionInfo>`
- `activeSessionId`, `focusedSessionIds` (Set), `layoutMode` (string), `sidebarOpen` (boolean)
- `broadcastMode` (boolean), `broadcastTargets` (Set)
- `lastSeenBytes`: `Map<string, number>` -- tracks bytes_received at last view time for activity badges
- Actions: addSession (auto-focuses and marks visible), removeSession, updateStatus, updateActivity, setKeepAwakeLocal, bumpBytes, markViewed, updateSessionConfig, setBroadcastMode, toggleBroadcastTarget, setActiveSession (marks as viewed), toggleFocusedSession, setFocusedSessions, setLayoutMode, toggleSidebar

**store/profiles.ts** -- Zustand store wrapping Tauri profile commands with loading/error state

**hooks/useSession.ts** -- wraps all Tauri invoke calls:
- `createSession`, `closeSession`, `writeToSession` (with broadcast fan-out to all targets), `resizeSession`, `setKeepAwake`, `updateConfig` (merges partial config with current), `readTranscript`

**hooks/useTerminal.ts** -- xterm.js lifecycle:
- Creates Terminal with Ghostty theme, JetBrains Mono font, cursor blink, 10k scrollback, `macOptionIsMeta`
- Loads FitAddon, WebLinksAddon, then attempts WebglAddon (with `onContextLoss` recovery and silent fallback)
- Waits for `document.fonts.ready` before fitting; forces glyph atlas rebuild via `fontFamily` re-assignment to prevent text overlap from font-swap race
- Exposes `initTerminal`, `write`, `fit`, `focus`, `dispose`
- Cleanup handles WebGL addon throwing during StrictMode double-unmount

**hooks/useTick.ts** -- simple `setInterval` that increments a counter to trigger re-renders for live duration displays

**types/index.ts** -- all shared types, constants, and utility functions:
- `SessionConfig`, `Profile`, `SessionInfo`, `SessionStatus`, `SessionOutput`, `StatusUpdate`
- `DANGEROUS_PATTERNS` (12 regexes) and `isDangerousCommand()` function
- `TAG_COLORS` map and `tagColor()` resolver (custom color > tag default > null)
- `STATUS_COLORS`, `STATUS_LABELS`, `LAYOUT_PRESETS`
- `formatDuration()` (compact: 45s, 12m, 3h 5m, 2d 4h), `formatBytes()` (12 B, 3.4 KB, 8.1 MB)
- `sessionHostLabel()`, `profileToSessionConfig()`

### Key Components

- **TerminalGrid.tsx**: the layout engine. Computes `visibleSessions` based on `layoutMode` and `focusedSessionIds`, then renders the appropriate structure: single panel (Focus), `PanelGroup` horizontal (Split), `PanelGroup` vertical (Stack), nested `PanelGroup`s (Grid), `FreeLayout` (Free), or CSS grid (Monitor). Resize handles have invisible 10px hit areas on each side.
- **TerminalPanel.tsx**: renders a single terminal panel. Contains: xterm instance mounting via `useTerminal`, dangerous command interception (line buffer that accumulates keystrokes and checks for dangerous patterns on Enter), keep-awake toggle, transcript export to clipboard as Markdown, session settings panel overlay, tag/broadcast visual treatments (red ring for broadcast, tag-colored pills in header), activity-since-viewed badge, reconnect counter. `ResizeObserver` triggers `fit()` on panel resize. Two delayed `fit()` calls after mount (300ms, 1500ms) to handle race with PTY creation.
- **FreeLayout.tsx**: wraps `react-grid-layout` (WidthProvider) with localStorage persistence (`cc:free-layout` key), 12-column grid, 32px row height, auto-placement for new sessions (tile across cols 0/6), garbage collection of stale entries on session removal. Drag handle is `.session-drag-handle` (the panel header).
- **NewSessionModal.tsx**: SSH/Local tab switcher, profile strip (with search when > 4 profiles), SSH config import button, form fields (name, description, tag picker, host, user, advanced: port, identity file, project dir, startup command, tmux, auto-reconnect), save-as-profile checkbox. Auto-names blank sessions. Carries `ssh_alias` through from selected profile.
- **SessionSettingsPanel.tsx**: anchored overlay (absolute positioned, top-right of panel) for editing live session settings: name, description, tag (with preset buttons), custom hex color input, dangerous command guard checkbox, notification level (3 buttons), auto-reconnect, tmux wrapping. Calls `updateConfig` on save.
- **DangerousCommandModal.tsx**: displays the intercepted command, session name, and a text input that must match the session name exactly. Enter confirms if matched; Escape cancels.
- **CloseSessionModal.tsx**: checks if session is in an active state (Thinking/Writing/RunningCommand); shows amber warning header and mentions tmux if enabled. Cancel/Escape dismisses.
- **Sidebar.tsx**: expanded mode (240px) and collapsed mode (40px). Expanded shows session list with StatusDot, name, tag pill, host label, status badge, uptime, current task. Controls: eye toggle (show/hide in grid), close button. Multi-select mode: checkbox UI, select-all, bulk close with count. Footer shows active/total counts. Quick local terminal button (Cmd+T).
- **OverviewPanel.tsx**: 224px right panel. SessionCard components with StatusDot, name, tag pill, status label (color-coded), uptime, current task. Header shows connected count and thinking count.
- **StatusBar.tsx**: 24px bottom bar. Left: connected/total, SSH count, local count, keep-awake count, error count. Center: active session name, host, uptime. Right: broadcast indicator (pulsing red), layout mode, bytes received/sent, clock.
- **LayoutBar.tsx**: 36px bar above terminal area. Left: six layout buttons (icon + label) with active highlight. Right: broadcast toggle (red pulsing when active), visible/total count, overview panel toggle.

---

## Known Gotchas

### StrictMode Double-Mount

React 18 StrictMode in development causes components to mount, unmount, and remount. This creates race conditions with Tauri event listeners in App.tsx. The solution is a `cancelled` flag pattern:

```typescript
useEffect(() => {
  let cancelled = false;
  const unlistens: Array<() => void> = [];
  (async () => {
    const u1 = await listen(...);
    if (cancelled) { u1(); return; }
    unlistens.push(u1);
  })();
  return () => {
    cancelled = true;
    unlistens.forEach((u) => u());
  };
}, []);
```

Without this, listeners from the first mount's async setup race with the cleanup, leading to duplicate event handling or dropped events.

### Output Handler Registry

Terminal output routing uses a ref-based registry (`outputHandlers` in App.tsx): each TerminalPanel registers its `write` function on mount and unregisters on unmount. This replaced an earlier DOM-query approach that broke when panels remounted (layout changes, StrictMode). The Map is stable across renders and layout transitions.

### WebGL Addon Cleanup

The xterm.js WebGL addon can throw during StrictMode double-unmount cleanup when it accesses `_terminal._core._store` on an already-disposed terminal. The `dispose()` callback in `useTerminal` wraps `terminal.dispose()` in a try/catch to swallow this safely.

### DMG Build

`npm run tauri build` may fail on the DMG creation step if `create-dmg` is not installed or there are codesigning issues. The `.app` bundle in `target/release/bundle/macos/` is usually fine even if DMG creation fails.

### PTY Environment Variables

Local sessions need explicit environment variable forwarding (HOME, PATH, USER, LANG, TERM, COLORTERM) because the PTY subprocess does not inherit the full shell environment. SSH sessions handle this differently: `TERM` and `COLORTERM` are exported via the SSH remote command because `sshd`'s `AcceptEnv` typically blocks them.

### Tray Menu Rebuild

The tray menu is rebuilt from scratch every 2 seconds by a background Rust thread. This is necessary because Tauri 2's menu API does not support in-place item updates. The rebuild is cheap (just string formatting and menu construction) but means the menu briefly flickers if clicked during a rebuild cycle.

### lib.rs `.run()` Pattern

The Tauri builder is split: `.build()` returns the app, then `.run()` is called separately to handle `RunEvent::ExitRequested`. This is required to prevent the app from quitting when all windows are closed (the tray icon keeps it alive). If you refactor the setup, keep this two-step pattern.

### Startup Command Timing

Startup commands are typed into the PTY once the output contains a prompt-like suffix (`$`, `%`, `>`, `#`), which signals that the shell (and its `.zshrc`/`.bashrc`) has finished loading. The command is sent as `"{cmd}\r"` (with carriage return). The `startup_sent` flag prevents re-sending on reconnect. This replaced an earlier fixed 500ms delay that caused double-echo when readline/zle hadn't finished initialising yet.

### Font Loading Race Condition

JetBrains Mono is loaded from Google Fonts with `display=swap`. xterm.js must not measure cell dimensions until the font is available, or the glyph atlas will be built with fallback-font metrics — causing text overlap and misaligned rendering. The `useTerminal` hook waits for `document.fonts.ready`, then forces a glyph atlas rebuild by re-assigning `fontFamily` before calling `fit()`. This mirrors how Ghostty waits for stable font metrics before computing the terminal grid.

### Dangerous Command Line Buffer

The dangerous command interception in TerminalPanel.tsx maintains a `lineBuf` ref that accumulates printable characters and handles backspace/Ctrl+C. When Enter is detected, the buffer is checked against `DANGEROUS_PATTERNS`. If matched, Enter (and any data after it) is held back and the modal is shown. On confirm, the held data is sent; on cancel, Ctrl+C is sent to clear the shell line. The buffer operates on raw xterm `onData` events, not on rendered terminal content.

### Notification Cap

Notifications are capped at 5 per session lifetime (`MAX_NOTIFICATIONS_PER_SESSION` in lib.rs). This prevents flood when a failing command spams error output that oscillates the session status between Error and other states. The counter is per-session and per-PTY-lifecycle (resets on reconnect because the reader loop restarts).

### PTY Size Race

The PTY starts at 80x24 but the xterm panel may be larger. The initial `fit()` triggers `onResize`, but if it races with session creation the resize can be lost. TerminalPanel fires two delayed `fit()` calls (300ms and 1500ms after mount) to guarantee the remote shell knows the correct dimensions.

---

## Design Decisions

### Why portable-pty instead of Tauri Shell plugin

The Tauri Shell plugin provides `Command::spawn()` but gives you pipes, not a PTY. Terminals need a real PTY for line editing, cursor movement, colors, and window size reporting. `portable-pty` provides cross-platform PTY allocation with proper `ioctl` resize support.

### Why Zustand instead of React Context

The app has many components that need to read session state (Sidebar, TerminalGrid, OverviewPanel, StatusBar, TerminalPanel). With React Context, any state change would re-render every consumer. Zustand's selector-based subscriptions mean components only re-render when their specific slice of state changes.

### Why ref-based output handler registry

Tauri events are global. When a `session-output` event arrives, we need to route it to the correct xterm instance. Using DOM queries or React state would be fragile across layout changes and remounts. The ref-based Map is stable across renders and layout transitions.

### Why Ghostty theme

Ghostty is a modern terminal emulator with well-chosen colors that work well on dark backgrounds. Using its palette gives Command Center a consistent, polished look without needing a theme engine. The theme colors are also used as the basis for Tailwind's custom surface/border/accent tokens.

### Why line-buffered Claude status parsing in Rust

The Claude Code CLI uses spinner characters, specific prefixes ("Edit:", "Bash:", etc.), and line-based output. Parsing happens line-by-line in the Rust read loop because: (a) it needs to be fast (runs on every PTY read), (b) it needs to emit status events to the frontend immediately, and (c) doing it in Rust avoids sending raw output to JS for parsing.

### Why exponential backoff for auto-reconnect

Network drops can be transient (Wi-Fi hiccup) or persistent (VPN down). Exponential backoff (2s, 4s, 8s, ..., 60s max) handles both without hammering the server. The reconnect loop checks if the session still exists before each attempt so closing the session stops reconnection.

### Why transcript front-truncation

Transcripts are raw PTY output and can grow large (especially with Claude Code producing lots of text). Front-truncation keeps the most recent output, which is almost always what you want when debugging. The 5 MB cap prevents runaway disk usage. Truncation is checked every 200 write batches rather than every write for performance.

### Why startup commands are typed into the PTY

Startup commands (like `claude`) are sent as keystrokes into the live PTY after the shell prompt appears, rather than being appended to the shell command. This means they run in the interactive shell context where aliases, functions, and `.zshrc` customizations are available. Appending to the command builder would run them before the interactive shell loads. The prompt is detected by checking for a trailing `$`, `%`, `>`, or `#` in the PTY output.

### Why tmux wrapping uses graceful fallback

The tmux wrap command is `command -v tmux >/dev/null && tmux new-session -A -s cc_NAME || exec $SHELL -l`. This falls back to a plain login shell if tmux is not installed on the remote, rather than failing the session entirely. The `-A` flag means tmux attaches to an existing session if one exists with that name.

### Why broadcastMode fan-out happens in useSession

Broadcast fan-out (sending keystrokes to multiple sessions) is implemented in the `writeToSession` function in `useSession.ts` rather than in Rust. This keeps the broadcast logic in one place (the hook) and avoids needing a separate Tauri command. The fan-out uses `Promise.all` with parallel `invoke` calls, which is fast enough for interactive typing.

---

## How to Add New Features

### Adding a new Tauri command

1. Add the function in `src-tauri/src/lib.rs` with the `#[tauri::command]` attribute
2. Register it in the `invoke_handler` array in the `run()` function
3. Call it from the frontend using `invoke<ReturnType>("command_name", { args })`
4. If it needs session state, take `State<'_, Arc<AppState>>` as a parameter
5. If it needs the app handle (for events, notifications, paths), take `AppHandle`

### Adding a new session status

1. Add the variant to `SessionStatus` enum in `lib.rs`
2. Add the variant to the `SessionStatus` type in `src/types/index.ts`
3. Add entries to `STATUS_COLORS` and `STATUS_LABELS` in `types/index.ts`
4. Add detection logic to `detect_claude_status()` in `lib.rs`
5. Add a tray glyph in `build_tray_menu()` in `lib.rs`
6. Update the `StatusDot` component if the new status needs animation

### Adding a new layout mode

1. Add a `LAYOUTS` entry in `src/components/LayoutBar.tsx` with id, label, icon, description
2. Add a layout key entry in the keyboard shortcuts handler in `App.tsx`
3. Add the rendering logic in `src/components/TerminalGrid.tsx` (compute `visibleSessions`, render panels)
4. Add label to `LAYOUT_LABELS` in `StatusBar.tsx`

### Adding a new profile field

1. Add the field to the `Profile` struct in `src-tauri/src/profiles.rs` (with `#[serde(default)]`)
2. Add the field to the `Profile` interface in `src/types/index.ts`
3. Add it to `profileToSessionConfig()` if it maps to a `SessionConfig` field
4. Add it to the `SessionConfig` struct in `lib.rs` if it affects session behavior
5. Add UI for it in `NewSessionModal.tsx` and/or `SessionSettingsPanel.tsx`

### Adding a new dangerous command pattern

1. Add a regex to the `DANGEROUS_PATTERNS` array in `src/types/index.ts`
2. That is all -- the existing `isDangerousCommand()` function checks all patterns

---

## File Quick Reference

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | All Rust backend logic: PTY, SSH, sessions, reconnect, tray, notifications, transcripts |
| `src-tauri/src/profiles.rs` | Profile storage + ssh_config parser |
| `src-tauri/src/main.rs` | Entry point (calls `lib::run()`) |
| `src-tauri/tauri.conf.json` | App config: window size (1400x900, min 900x600), titleBarStyle Overlay, bundle |
| `src-tauri/Cargo.toml` | Rust dependencies: tauri 2, portable-pty 0.8, parking_lot, chrono, uuid |
| `src/App.tsx` | Root component: event wiring, shortcuts, dock badge, sleep guard |
| `src/types/index.ts` | All types, constants, patterns, formatters |
| `src/store/sessions.ts` | Zustand session store: sessions Map, layout, broadcast, activity tracking |
| `src/store/profiles.ts` | Zustand profile store: wraps Tauri CRUD commands |
| `src/hooks/useSession.ts` | Tauri command wrappers with broadcast fan-out |
| `src/hooks/useTerminal.ts` | xterm.js setup: Ghostty theme, WebGL, FitAddon, WebLinksAddon |
| `src/hooks/useTick.ts` | Interval re-render trigger for live durations |
| `src/components/TerminalGrid.tsx` | Layout engine: computes visible sessions, renders layout |
| `src/components/TerminalPanel.tsx` | Single terminal panel: xterm, dangerous cmd interception, settings |
| `src/components/FreeLayout.tsx` | react-grid-layout wrapper with localStorage persistence |
| `src/components/NewSessionModal.tsx` | Session creation form with profiles and SSH config import |
| `src/components/SessionSettingsPanel.tsx` | Live settings overlay for running sessions |
| `src/components/DangerousCommandModal.tsx` | Type-session-name confirmation modal |
| `src/components/CloseSessionModal.tsx` | Close confirmation with active-session warning |
| `src/components/Sidebar.tsx` | Session list with multi-select, status, controls |
| `src/components/LayoutBar.tsx` | Layout mode buttons, broadcast toggle, overview toggle |
| `src/components/OverviewPanel.tsx` | Right panel with session status cards |
| `src/components/StatusBar.tsx` | Bottom bar: stats, traffic, layout, broadcast, clock |
| `src/components/HelpPanel.tsx` | Help overlay with docs and shortcut reference |
| `src/components/StatusDot.tsx` | Animated status indicator |
| `package.json` | Frontend deps: React 18, xterm.js 5, Zustand 4, react-grid-layout, react-resizable-panels |

---

## Current Roadmap

These are ideas, not commitments:

- Session groups for batch operations
- Sidebar search/filter
- Configurable terminal themes
- Session templates (pre-configured bundles)
- Multi-window support (detach panels)
- Session recording/playback with timing
- Plugin system for status parsers
- Linux and Windows platform support
- Drag-and-drop sidebar reordering
- Panel splitting within the current layout
- Claude Code MCP protocol integration for richer status
- Automated tests (Rust unit tests, React component tests)
