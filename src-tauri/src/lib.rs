mod profiles;

use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;

use profiles::ProfileStore;

// ── Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub name: String,
    /// "ssh" (default) or "local"
    #[serde(default)]
    pub kind: Option<String>,
    pub host: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    /// Remote project dir for SSH, working directory for local
    pub project_dir: Option<String>,
    /// Optional shell snippet to run after connect.
    #[serde(default)]
    pub startup_command: Option<String>,
    /// If set, ssh is invoked with this alias instead of `user@host`.
    #[serde(default)]
    pub ssh_alias: Option<String>,
    /// Free-form description, surfaced as a tooltip.
    #[serde(default)]
    pub description: Option<String>,
    /// Color tag — "prod"/"staging"/"dev"/"personal" — drives panel border treatment.
    #[serde(default)]
    pub tag: Option<String>,
    /// Hex color override for the tag.
    #[serde(default)]
    pub color: Option<String>,
    /// Wrap connect in `tmux new-session -A -s <slug>` so the remote session
    /// survives network drops.
    #[serde(default)]
    pub wrap_in_tmux: bool,
    /// Auto-respawn the PTY if it dies.
    #[serde(default)]
    pub auto_reconnect: bool,
    /// When true, the frontend intercepts potentially dangerous commands
    /// (rm -rf, dd, mkfs…) before sending Enter and shows a confirmation.
    #[serde(default)]
    pub dangerous_command_confirm: bool,
    /// "all" | "errors" | "muted" — controls which status transitions
    /// trigger macOS native notifications.
    #[serde(default = "default_notification_level")]
    pub notification_level: String,
}

fn default_notification_level() -> String {
    "all".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionStatus {
    Connecting,
    Connected,
    Reconnecting,
    Disconnected,
    Thinking,
    Writing,
    RunningCommand,
    Error,
    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub config: SessionConfig,
    pub status: SessionStatus,
    pub connected_at: Option<DateTime<Utc>>,
    pub last_activity: DateTime<Utc>,
    pub current_task: Option<String>,
    pub bytes_received: u64,
    pub bytes_sent: u64,
    pub lines_processed: u64,
    #[serde(default)]
    pub keep_awake: bool,
    /// How many times this session has been auto-reconnected since open.
    #[serde(default)]
    pub reconnect_count: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionOutput {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatusUpdate {
    pub session_id: String,
    pub status: SessionStatus,
    pub task: Option<String>,
    pub timestamp: DateTime<Utc>,
}

// ── Session Handle (non-serializable internals) ────────────────────────

struct SessionHandle {
    info: SessionInfo,
    writer: Box<dyn Write + Send>,
    _master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send>,
}

// ── App State ──────────────────────────────────────────────────────────

pub struct AppState {
    sessions: Mutex<HashMap<String, SessionHandle>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

// ── Path expansion ─────────────────────────────────────────────────────

fn expand_tilde(path: &str) -> String {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return format!("{}/{}", home, stripped);
        }
    }
    if path == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return home;
        }
    }
    path.to_string()
}

/// Slugify a session name for safe use as a tmux session name.
fn slugify(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect()
}

// ── Claude Code output parser ──────────────────────────────────────────

fn detect_claude_status(line: &str) -> Option<(SessionStatus, Option<String>)> {
    let trimmed = line.trim();

    if trimmed.contains("⠋") || trimmed.contains("⠙") || trimmed.contains("⠹")
        || trimmed.contains("Thinking") || trimmed.contains("thinking...")
    {
        return Some((SessionStatus::Thinking, Some("Thinking...".into())));
    }

    if trimmed.starts_with("Edit:") || trimmed.starts_with("Write:") || trimmed.contains("wrote to") {
        return Some((SessionStatus::Writing, Some(trimmed.to_string())));
    }

    if trimmed.starts_with("Execute:") || trimmed.starts_with("Bash:") || trimmed.starts_with("$") {
        return Some((SessionStatus::RunningCommand, Some(trimmed.to_string())));
    }

    if trimmed.contains("Tool:") || trimmed.contains("Using tool") {
        return Some((SessionStatus::RunningCommand, Some(trimmed.to_string())));
    }

    if trimmed.starts_with("Error:") || trimmed.starts_with("error[") {
        return Some((SessionStatus::Error, Some(trimmed.to_string())));
    }

    None
}

// ── Command building ───────────────────────────────────────────────────

fn build_ssh_command(config: &SessionConfig) -> Result<CommandBuilder, String> {
    let mut cmd = CommandBuilder::new("ssh");
    cmd.arg("-o");
    cmd.arg("ServerAliveInterval=30");
    cmd.arg("-o");
    cmd.arg("ServerAliveCountMax=3");
    cmd.arg("-t");

    // Tell SSH to forward TERM so the remote shell knows we support 256-color.
    // SSH forwards TERM by default in most configs, but setting it in the local
    // env ensures the ssh process itself advertises xterm-256color.
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    if let Ok(sock) = std::env::var("SSH_AUTH_SOCK") {
        cmd.env("SSH_AUTH_SOCK", sock);
    }

    if let Some(alias) = config.ssh_alias.as_deref().filter(|s| !s.is_empty()) {
        cmd.arg(alias);
    } else {
        let host = config
            .host
            .as_deref()
            .filter(|h| !h.is_empty())
            .ok_or("SSH session requires a host")?;
        let user = config
            .user
            .as_deref()
            .filter(|u| !u.is_empty())
            .ok_or("SSH session requires a user")?;

        let port = config.port.unwrap_or(22);
        cmd.arg("-p");
        cmd.arg(port.to_string());

        if let Some(ref key) = config.identity_file {
            if !key.is_empty() {
                cmd.arg("-i");
                cmd.arg(expand_tilde(key));
            }
        }

        cmd.arg(format!("{}@{}", user, host));
    }

    // Always pass a remote command that sets TERM + COLORTERM so Claude Code
    // and other TUI apps get full color support. sshd's AcceptEnv typically
    // only allows LANG/LC_*, so we can't rely on env forwarding.
    let mut parts: Vec<String> = vec![
        "export TERM=xterm-256color COLORTERM=truecolor".to_string(),
    ];
    if let Some(dir) = config.project_dir.as_deref().filter(|s| !s.is_empty()) {
        parts.push(format!("cd {}", dir));
    }
    if config.wrap_in_tmux {
        let session_name = format!("cc_{}", slugify(&config.name));
        parts.push(format!(
            "command -v tmux >/dev/null 2>&1 && tmux new-session -A -s {} || exec $SHELL -l",
            session_name
        ));
    } else {
        parts.push("exec $SHELL -l".to_string());
    }
    cmd.arg(parts.join(" && "));

    Ok(cmd)
}

fn build_local_command(config: &SessionConfig) -> Result<CommandBuilder, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);

    // Only tmux wrapping is done via -c; startup_command is typed into the
    // PTY after the shell loads (so aliases/functions work).
    if config.wrap_in_tmux {
        let session_name = format!("cc_{}", slugify(&config.name));
        cmd.arg("-l");
        cmd.arg("-c");
        // Graceful: fall back to plain shell if tmux isn't installed.
        cmd.arg(format!(
            "command -v tmux >/dev/null 2>&1 && tmux new-session -A -s {} || exec $SHELL -l",
            session_name
        ));
    } else {
        cmd.arg("-l");
    }

    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", &home);
        if let Some(ref dir) = config.project_dir {
            if !dir.is_empty() {
                cmd.cwd(expand_tilde(dir));
            } else {
                cmd.cwd(&home);
            }
        } else {
            cmd.cwd(&home);
        }
    }
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    if let Ok(user) = std::env::var("USER") {
        cmd.env("USER", user);
    }
    if let Ok(lang) = std::env::var("LANG") {
        cmd.env("LANG", lang);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    Ok(cmd)
}

// Spawns a PTY for the given config and returns (master, writer, reader, child).
type PtyParts = (
    Box<dyn MasterPty + Send>,
    Box<dyn Write + Send>,
    Box<dyn Read + Send>,
    Box<dyn Child + Send>,
);

fn spawn_pty(config: &SessionConfig) -> Result<PtyParts, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let kind = config.kind.as_deref().unwrap_or("ssh");
    let cmd = match kind {
        "local" => build_local_command(config)?,
        _ => build_ssh_command(config)?,
    };

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get writer: {}", e))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get reader: {}", e))?;

    Ok((pair.master, writer, reader, child))
}

// ── Scrollback transcripts ────────────────────────────────────────────

const MAX_TRANSCRIPT_BYTES: u64 = 5 * 1024 * 1024; // 5 MB cap per session log
const TRANSCRIPT_TRUNCATE_TO: u64 = 1 * 1024 * 1024; // keep 1 MB on truncate

fn transcript_path(app: &AppHandle, session_id: &str) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("transcripts");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join(format!("{}.log", session_id)))
}

fn maybe_truncate(path: &PathBuf) {
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > MAX_TRANSCRIPT_BYTES {
            // Truncate-from-front: read last TRUNCATE_TO bytes, rewrite file
            if let Ok(content) = std::fs::read(path) {
                let start = content
                    .len()
                    .saturating_sub(TRANSCRIPT_TRUNCATE_TO as usize);
                let _ = std::fs::write(path, &content[start..]);
            }
        }
    }
}

// ── Notifications ─────────────────────────────────────────────────────

/// Max notifications per session before suppression. Prevents flood when a
/// failing command spams error output that oscillates the status.
const MAX_NOTIFICATIONS_PER_SESSION: u32 = 5;

fn notify_status_transition(
    app: &AppHandle,
    session_name: &str,
    prev: &SessionStatus,
    next: &SessionStatus,
    notification_level: &str,
    notification_count: &mut u32,
) {
    if notification_level == "muted" {
        return;
    }
    if *notification_count >= MAX_NOTIFICATIONS_PER_SESSION {
        return; // suppressed — already sent enough for this session
    }
    // Only notify on transitions worth interrupting the user for
    let (title, body) = match (prev, next) {
        (_, SessionStatus::Error) => (
            format!("⚠ Error in {}", session_name),
            "Session encountered an error".to_string(),
        ),
        (SessionStatus::Connected, SessionStatus::Disconnected)
        | (SessionStatus::Reconnecting, SessionStatus::Disconnected) => (
            format!("✕ {} disconnected", session_name),
            "The remote PTY closed unexpectedly".to_string(),
        ),
        (SessionStatus::Reconnecting, SessionStatus::Connected) => (
            format!("✓ {} reconnected", session_name),
            "Session is back online".to_string(),
        ),
        (SessionStatus::Thinking, SessionStatus::Idle)
        | (SessionStatus::Writing, SessionStatus::Idle)
        | (SessionStatus::RunningCommand, SessionStatus::Idle) if notification_level == "all" => (
            format!("✓ {} idle", session_name),
            "Claude finished its task".to_string(),
        ),
        _ => return,
    };

    *notification_count += 1;
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

// ── Reader / lifetime thread ──────────────────────────────────────────

fn run_session_loop(
    app_handle: AppHandle,
    state: Arc<AppState>,
    session_id: String,
    initial_reader: Box<dyn Read + Send>,
    transcript: Option<PathBuf>,
    startup_command: Option<String>,
) {
    thread::spawn(move || {
        let mut reader = initial_reader;
        let mut prev_status = SessionStatus::Connecting;
        let mut writes_since_truncate_check: u32 = 0;
        let mut notification_count: u32 = 0;
        let mut startup_sent = startup_command.is_none(); // true if nothing to send

        loop {
            let mut buf = [0u8; 4096];
            let mut line_buf = String::new();

            // ── Read loop for the current PTY ──
            let exit_reason = loop {
                match reader.read(&mut buf) {
                    Ok(0) => break "eof",
                    Ok(n) => {
                        let chunk = &buf[..n];
                        let data = String::from_utf8_lossy(chunk).to_string();

                        // Persist transcript
                        if let Some(ref path) = transcript {
                            if let Ok(mut f) = OpenOptions::new()
                                .create(true)
                                .append(true)
                                .open(path)
                            {
                                let _ = f.write_all(chunk);
                            }
                            writes_since_truncate_check += 1;
                            if writes_since_truncate_check >= 200 {
                                writes_since_truncate_check = 0;
                                maybe_truncate(path);
                            }
                        }

                        let _ = app_handle.emit(
                            "session-output",
                            SessionOutput {
                                session_id: session_id.clone(),
                                data: data.clone(),
                            },
                        );

                        // Update stats + connecting→connected
                        {
                            let mut sessions = state.sessions.lock();
                            if let Some(handle) = sessions.get_mut(&session_id) {
                                handle.info.bytes_received += n as u64;
                                handle.info.last_activity = Utc::now();

                                if matches!(
                                    handle.info.status,
                                    SessionStatus::Connecting | SessionStatus::Reconnecting
                                ) {
                                    let was = handle.info.status.clone();
                                    handle.info.status = SessionStatus::Connected;
                                    let session_name = handle.info.config.name.clone();
                                    let notif_level = handle.info.config.notification_level.clone();
                                    drop(sessions);

                                    let _ = app_handle.emit(
                                        "session-status",
                                        StatusUpdate {
                                            session_id: session_id.clone(),
                                            status: SessionStatus::Connected,
                                            task: None,
                                            timestamp: Utc::now(),
                                        },
                                    );
                                    notify_status_transition(
                                        &app_handle,
                                        &session_name,
                                        &was,
                                        &SessionStatus::Connected,
                                        &notif_level,
                                        &mut notification_count,
                                    );
                                    prev_status = SessionStatus::Connected;

                                    // Mark that we should watch for a shell
                                    // prompt before typing the startup command.
                                    // (We no longer fire it on a fixed delay —
                                    // that caused double-echo when zle/readline
                                    // hadn't finished initialising yet.)
                                }
                            }
                        }

                        // ── Send startup command once we see a shell prompt ──
                        // Instead of a fixed delay, we wait until the output
                        // contains a prompt-like suffix ($ % > #) which means
                        // the shell (and its .zshrc/.bashrc) has finished
                        // loading and is ready for input.
                        if !startup_sent {
                            let trimmed = data.trim_end();
                            if trimmed.ends_with('$')
                                || trimmed.ends_with('%')
                                || trimmed.ends_with('>')
                                || trimmed.ends_with('#')
                            {
                                startup_sent = true;
                                if let Some(ref sc) = startup_command {
                                    let cmd_str = format!("{}\r", sc);
                                    let mut sessions = state.sessions.lock();
                                    if let Some(h) = sessions.get_mut(&session_id) {
                                        let _ = h.writer.write_all(cmd_str.as_bytes());
                                    }
                                }
                            }
                        }

                        // Line-buffered Claude state parsing
                        line_buf.push_str(&data);
                        while let Some(newline_pos) = line_buf.find('\n') {
                            let line = line_buf[..newline_pos].to_string();
                            line_buf = line_buf[newline_pos + 1..].to_string();

                            if let Some((status, task)) = detect_claude_status(&line) {
                                let (session_name, notif_level) = {
                                    let mut sessions = state.sessions.lock();
                                    let info = sessions.get(&session_id).map(|h| {
                                        (h.info.config.name.clone(), h.info.config.notification_level.clone())
                                    }).unwrap_or_default();
                                    if let Some(handle) = sessions.get_mut(&session_id) {
                                        handle.info.status = status.clone();
                                        handle.info.current_task = task.clone();
                                        handle.info.lines_processed += 1;
                                    }
                                    info
                                };

                                let _ = app_handle.emit(
                                    "session-status",
                                    StatusUpdate {
                                        session_id: session_id.clone(),
                                        status: status.clone(),
                                        task: task.clone(),
                                        timestamp: Utc::now(),
                                    },
                                );
                                notify_status_transition(
                                    &app_handle,
                                    &session_name,
                                    &prev_status,
                                    &status,
                                    &notif_level,
                                    &mut notification_count,
                                );
                                prev_status = status;
                            }
                        }
                    }
                    Err(_) => break "err",
                }
            };

            let _ = exit_reason; // (intentionally unused — both paths fall through to reconnect logic)

            // ── Decide whether to reconnect ──
            let (should_reconnect, config_for_reconnect, session_name) = {
                let sessions = state.sessions.lock();
                match sessions.get(&session_id) {
                    Some(h) => (
                        h.info.config.auto_reconnect,
                        h.info.config.clone(),
                        h.info.config.name.clone(),
                    ),
                    None => (false, SessionConfig::default(), String::new()),
                }
            };

            if !should_reconnect {
                // Mark disconnected and exit
                {
                    let mut sessions = state.sessions.lock();
                    if let Some(handle) = sessions.get_mut(&session_id) {
                        handle.info.status = SessionStatus::Disconnected;
                    }
                }
                let _ = app_handle.emit(
                    "session-status",
                    StatusUpdate {
                        session_id: session_id.clone(),
                        status: SessionStatus::Disconnected,
                        task: None,
                        timestamp: Utc::now(),
                    },
                );
                notify_status_transition(
                    &app_handle,
                    &session_name,
                    &prev_status,
                    &SessionStatus::Disconnected,
                    &config_for_reconnect.notification_level,
                    &mut notification_count,
                );
                return;
            }

            // ── Auto-reconnect with exponential backoff ──
            {
                let mut sessions = state.sessions.lock();
                if let Some(handle) = sessions.get_mut(&session_id) {
                    handle.info.status = SessionStatus::Reconnecting;
                }
            }
            let _ = app_handle.emit(
                "session-status",
                StatusUpdate {
                    session_id: session_id.clone(),
                    status: SessionStatus::Reconnecting,
                    task: None,
                    timestamp: Utc::now(),
                },
            );
            prev_status = SessionStatus::Reconnecting;

            let mut backoff = Duration::from_secs(2);
            let new_reader = loop {
                // Bail if the user closed the session in the meantime
                if !state.sessions.lock().contains_key(&session_id) {
                    return;
                }
                thread::sleep(backoff);
                match spawn_pty(&config_for_reconnect) {
                    Ok((master, writer, new_reader, new_child)) => {
                        let mut sessions = state.sessions.lock();
                        if let Some(handle) = sessions.get_mut(&session_id) {
                            handle.writer = writer;
                            handle._master = master;
                            handle.child = new_child;
                            handle.info.reconnect_count += 1;
                            handle.info.last_activity = Utc::now();
                        }
                        break new_reader;
                    }
                    Err(_) => {
                        backoff = (backoff * 2).min(Duration::from_secs(60));
                    }
                }
            };
            reader = new_reader;
            // Loop back into the read loop with the fresh reader
        }
    });
}

impl Default for SessionConfig {
    fn default() -> Self {
        SessionConfig {
            name: String::new(),
            kind: None,
            host: None,
            user: None,
            port: None,
            identity_file: None,
            project_dir: None,
            startup_command: None,
            ssh_alias: None,
            description: None,
            tag: None,
            color: None,
            wrap_in_tmux: false,
            auto_reconnect: false,
            dangerous_command_confirm: false,
            notification_level: "all".to_string(),
        }
    }
}

// ── Keep-awake background ticker ──────────────────────────────────────

fn spawn_keep_awake_ticker(state: Arc<AppState>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(30));
        let mut sessions = state.sessions.lock();
        for handle in sessions.values_mut() {
            if handle.info.keep_awake {
                let _ = handle.writer.write_all(&[0u8]);
            }
        }
    });
}

// ── Tray icon ─────────────────────────────────────────────────────────

fn build_tray_menu(
    app: &AppHandle,
    state: &Arc<AppState>,
) -> Result<tauri::menu::Menu<tauri::Wry>, String> {
    let mut builder = MenuBuilder::new(app);

    let show_item = MenuItemBuilder::with_id("show", "Show Window")
        .build(app)
        .map_err(|e| e.to_string())?;
    builder = builder.item(&show_item);

    let new_item = MenuItemBuilder::with_id("new", "New Session…")
        .build(app)
        .map_err(|e| e.to_string())?;
    builder = builder.item(&new_item);

    builder = builder.item(
        &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
    );

    // Snapshot the session list
    let snapshot: Vec<(String, String, SessionStatus, Option<String>)> = {
        let sessions = state.sessions.lock();
        sessions
            .values()
            .map(|h| {
                (
                    h.info.id.clone(),
                    h.info.config.name.clone(),
                    h.info.status.clone(),
                    h.info.current_task.clone(),
                )
            })
            .collect()
    };

    if snapshot.is_empty() {
        let empty = MenuItemBuilder::with_id("noop", "(no active sessions)")
            .enabled(false)
            .build(app)
            .map_err(|e| e.to_string())?;
        builder = builder.item(&empty);
    } else {
        for (id, name, status, task) in snapshot {
            let glyph = match status {
                SessionStatus::Connected => "●",
                SessionStatus::Connecting | SessionStatus::Reconnecting => "◌",
                SessionStatus::Thinking => "◐",
                SessionStatus::Writing | SessionStatus::RunningCommand => "◑",
                SessionStatus::Error => "✕",
                SessionStatus::Disconnected => "○",
                SessionStatus::Idle => "·",
            };
            let label = match task {
                Some(t) if !t.is_empty() => format!("{}  {}  — {}", glyph, name, truncate(&t, 32)),
                _ => format!("{}  {}", glyph, name),
            };
            let item = MenuItemBuilder::with_id(format!("session:{}", id), label)
                .build(app)
                .map_err(|e| e.to_string())?;
            builder = builder.item(&item);
        }
    }

    builder = builder.item(
        &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
    );
    let quit = MenuItemBuilder::with_id("quit", "Quit Command Center")
        .build(app)
        .map_err(|e| e.to_string())?;
    builder = builder.item(&quit);

    builder.build().map_err(|e| e.to_string())
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
}

fn spawn_tray_updater(app: AppHandle, state: Arc<AppState>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(2));
        if let Some(tray) = app.tray_by_id("main") {
            if let Ok(menu) = build_tray_menu(&app, &state) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    });
}

// ── Tauri Commands ─────────────────────────────────────────────────────

#[tauri::command]
fn create_session(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    config: SessionConfig,
) -> Result<SessionInfo, String> {
    let id = Uuid::new_v4().to_string();
    let (master, writer, reader, child) = spawn_pty(&config)?;

    let kind = config.kind.as_deref().unwrap_or("ssh");
    let now = Utc::now();
    let initial_status = if kind == "local" {
        SessionStatus::Connected
    } else {
        SessionStatus::Connecting
    };

    let info = SessionInfo {
        id: id.clone(),
        config: config.clone(),
        status: initial_status,
        connected_at: Some(now),
        last_activity: now,
        current_task: None,
        bytes_received: 0,
        bytes_sent: 0,
        lines_processed: 0,
        keep_awake: false,
        reconnect_count: 0,
    };

    let handle = SessionHandle {
        info: info.clone(),
        writer,
        _master: master,
        child,
    };

    state.sessions.lock().insert(id.clone(), handle);

    let transcript = transcript_path(&app, &id);
    let startup_cmd = config.startup_command.clone().filter(|s| !s.is_empty());
    run_session_loop(
        app.clone(),
        Arc::clone(&*state),
        id.clone(),
        reader,
        transcript,
        startup_cmd,
    );

    Ok(info)
}

#[tauri::command]
fn write_to_session(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock();
    let handle = sessions
        .get_mut(&session_id)
        .ok_or("Session not found")?;

    let bytes = data.as_bytes();
    handle
        .writer
        .write_all(bytes)
        .map_err(|e| format!("Write failed: {}", e))?;

    handle.info.bytes_sent += bytes.len() as u64;
    handle.info.last_activity = Utc::now();
    Ok(())
}

#[tauri::command]
fn set_keep_awake(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    enabled: bool,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock();
    let handle = sessions
        .get_mut(&session_id)
        .ok_or("Session not found")?;
    handle.info.keep_awake = enabled;
    Ok(())
}

#[tauri::command]
fn resize_session(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock();
    let handle = sessions.get(&session_id).ok_or("Session not found")?;

    handle
        ._master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Resize failed: {}", e))?;

    Ok(())
}

#[tauri::command]
fn close_session(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    if let Some(mut handle) = state.sessions.lock().remove(&session_id) {
        // 1. Ask the shell / SSH / tmux to exit gracefully.
        //    Send Ctrl-C first (abort any running command), then "exit\r".
        let _ = handle.writer.write_all(b"\x03");
        let _ = handle.writer.write_all(b"exit\r");
        let _ = handle.writer.flush();

        // 2. Kill the child process tree. On Unix this sends SIGHUP to the
        //    process group leader, which propagates to all children (ssh,
        //    remote shell, tmux client, etc.).
        let _ = handle.child.kill();

        // 3. Wait briefly so the OS can reap the zombie. Spawn a thread so
        //    we don't block the Tauri command responder.
        thread::spawn(move || {
            let _ = handle.child.wait();
            // master and writer drop here, closing the PTY fd
        });
    }
    // Also delete the transcript file
    if let Some(path) = transcript_path(&app, &session_id) {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

#[tauri::command]
fn list_sessions(state: State<'_, Arc<AppState>>) -> Vec<SessionInfo> {
    let sessions = state.sessions.lock();
    sessions.values().map(|h| h.info.clone()).collect()
}

#[tauri::command]
fn get_session(state: State<'_, Arc<AppState>>, session_id: String) -> Option<SessionInfo> {
    let sessions = state.sessions.lock();
    sessions.get(&session_id).map(|h| h.info.clone())
}

/// Update a running session's config in place (for live settings edits).
/// Only fields that are `Some` / non-default in the partial are applied.
#[tauri::command]
fn update_session_config(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    partial: SessionConfig,
) -> Result<SessionInfo, String> {
    let mut sessions = state.sessions.lock();
    let handle = sessions
        .get_mut(&session_id)
        .ok_or("Session not found")?;

    let c = &mut handle.info.config;
    if !partial.name.is_empty() {
        c.name = partial.name;
    }
    if partial.tag.is_some() {
        c.tag = partial.tag;
    }
    if partial.color.is_some() {
        c.color = partial.color;
    }
    if partial.description.is_some() {
        c.description = partial.description;
    }
    // These booleans always overwrite
    c.auto_reconnect = partial.auto_reconnect;
    c.dangerous_command_confirm = partial.dangerous_command_confirm;
    c.wrap_in_tmux = partial.wrap_in_tmux; // only affects next reconnect
    c.notification_level = partial.notification_level;

    Ok(handle.info.clone())
}

#[tauri::command]
fn read_transcript(app: AppHandle, session_id: String) -> Result<String, String> {
    let path = transcript_path(&app, &session_id).ok_or("No transcript path")?;
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

// ── Lib entry ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState::new());
    let state_for_ticker = Arc::clone(&state);
    let state_for_tray = Arc::clone(&state);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(state)
        .manage(ProfileStore::default())
        .setup(move |app| {
            let handle = app.handle().clone();

            // Hydrate persisted profiles
            let store = app.state::<ProfileStore>();
            let loaded = profiles::load(&handle);
            *store.profiles.lock() = loaded;

            // Background workers
            spawn_keep_awake_ticker(Arc::clone(&state_for_ticker));
            spawn_tray_updater(handle.clone(), Arc::clone(&state_for_tray));

            // System tray (manually built so we control id, menu, click events)
            let initial_menu = build_tray_menu(&handle, &state_for_tray)
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            let icon = app
                .default_window_icon()
                .ok_or("missing default icon")?
                .clone();
            TrayIconBuilder::with_id("main")
                .icon(icon)
                .icon_as_template(true)
                .menu(&initial_menu)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref().to_string();
                    if id == "show" {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.unminimize();
                        }
                    } else if id == "new" {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                        let _ = app.emit("tray-new-session", ());
                    } else if id == "quit" {
                        app.exit(0);
                    } else if let Some(session_id) = id.strip_prefix("session:") {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.unminimize();
                        }
                        let _ = app.emit("activate-session", session_id.to_string());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_session,
            write_to_session,
            resize_session,
            close_session,
            list_sessions,
            get_session,
            set_keep_awake,
            update_session_config,
            read_transcript,
            profiles::list_profiles,
            profiles::save_profile,
            profiles::delete_profile,
            profiles::import_ssh_config,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app, event| {
        #[allow(clippy::single_match)]
        match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                // Prevent the app from exiting when all windows close (tray keeps it alive)
                api.prevent_exit();
            }
            _ => {}
        }
    });
}
