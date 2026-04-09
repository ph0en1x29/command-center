//! Persistent SSH/local connection profiles + ssh_config(5) importer.

use chrono::{DateTime, Utc};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    /// "ssh" or "local"
    pub kind: String,
    pub host: Option<String>,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    pub working_directory: Option<String>,
    /// Optional shell snippet to run after connect (before the interactive shell takes over).
    pub startup_command: Option<String>,
    /// If set, ssh is invoked with this alias (e.g. `ssh server`) instead of
    /// `ssh user@host`, so the matching `Host` block in ~/.ssh/config is
    /// honored — including UseKeychain, ProxyJump, ControlMaster, etc.
    #[serde(default)]
    pub ssh_alias: Option<String>,
    /// Free-form description shown in profile picker tooltips.
    #[serde(default)]
    pub description: Option<String>,
    /// Color tag — e.g. "prod" / "staging" / "dev" / "personal". Used to
    /// drive the panel border treatment so production sessions stand out.
    #[serde(default)]
    pub tag: Option<String>,
    /// Hex color associated with this profile (e.g. "#ef4444"). If unset,
    /// the tag's default color is used.
    #[serde(default)]
    pub color: Option<String>,
    /// Wrap the connect command in a `tmux new-session -A -s <name>` so the
    /// remote session survives network drops and can be reattached.
    #[serde(default)]
    pub wrap_in_tmux: bool,
    /// Auto-respawn the session if the underlying PTY dies (with backoff).
    #[serde(default)]
    pub auto_reconnect: bool,
    #[serde(default)]
    pub dangerous_command_confirm: bool,
    #[serde(default = "super::default_notification_level")]
    pub notification_level: String,
    pub created_at: DateTime<Utc>,
    /// Where this profile came from: "manual" | "ssh-config"
    pub source: String,
}

#[derive(Default)]
pub struct ProfileStore {
    pub profiles: Mutex<Vec<Profile>>,
}

fn profiles_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {}", e))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {}", e))?;
    Ok(dir.join("profiles.json"))
}

pub fn load(app: &AppHandle) -> Vec<Profile> {
    let path = match profiles_path(app) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    let raw = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn persist(app: &AppHandle, profiles: &[Profile]) -> Result<(), String> {
    let path = profiles_path(app)?;
    let json = serde_json::to_string_pretty(profiles).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("write profiles: {}", e))
}

// ── ssh_config parser ─────────────────────────────────────────────────

#[derive(Default)]
struct Builder {
    host: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
}

impl Builder {
    fn into_profile(self, name: String) -> Option<Profile> {
        let host = self.host.clone().or_else(|| Some(name.clone()));
        Some(Profile {
            id: Uuid::new_v4().to_string(),
            name: name.clone(),
            kind: "ssh".to_string(),
            host,
            user: self.user,
            port: self.port,
            identity_file: self.identity_file,
            working_directory: None,
            startup_command: None,
            ssh_alias: Some(name),
            description: None,
            tag: None,
            color: None,
            wrap_in_tmux: false,
            auto_reconnect: false,
            dangerous_command_confirm: false,
            notification_level: "all".to_string(),
            created_at: Utc::now(),
            source: "ssh-config".to_string(),
        })
    }
}

/// Minimal ssh_config(5) parser. Handles Host blocks, HostName, User, Port,
/// IdentityFile. Skips wildcard host patterns (* ? !) since they're match
/// rules, not connection targets. Only takes the first alias from a multi-
/// alias `Host` line.
pub fn parse_ssh_config(content: &str) -> Vec<Profile> {
    let mut profiles: Vec<Profile> = Vec::new();
    let mut current: Option<(String, Builder)> = None;

    let flush = |profiles: &mut Vec<Profile>, slot: Option<(String, Builder)>| {
        if let Some((name, b)) = slot {
            if let Some(p) = b.into_profile(name) {
                profiles.push(p);
            }
        }
    };

    for raw_line in content.lines() {
        // Strip comments
        let line = raw_line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }

        // Split into key/value (key may be followed by `=` or whitespace)
        let (key_raw, val_raw) = match line.find(|c: char| c.is_whitespace() || c == '=') {
            Some(idx) => (&line[..idx], line[idx + 1..].trim_start_matches(|c: char| c.is_whitespace() || c == '=')),
            None => (line, ""),
        };
        let key = key_raw.to_lowercase();
        let val = val_raw.trim().trim_matches('"');

        if key == "host" {
            // Close previous block
            flush(&mut profiles, current.take());

            // Open a new block, picking the first non-wildcard alias
            for alias in val.split_whitespace() {
                if !alias.contains('*') && !alias.contains('?') && !alias.starts_with('!') {
                    current = Some((alias.to_string(), Builder::default()));
                    break;
                }
            }
        } else if let Some((_, ref mut b)) = current {
            match key.as_str() {
                "hostname" => b.host = Some(val.to_string()),
                "user" => b.user = Some(val.to_string()),
                "port" => b.port = val.parse().ok(),
                "identityfile" => b.identity_file = Some(val.to_string()),
                _ => {}
            }
        }
    }

    flush(&mut profiles, current);
    profiles
}

// ── Tauri commands ────────────────────────────────────────────────────

#[tauri::command]
pub fn list_profiles(state: State<'_, ProfileStore>) -> Vec<Profile> {
    state.profiles.lock().clone()
}

#[tauri::command]
pub fn save_profile(
    app: AppHandle,
    state: State<'_, ProfileStore>,
    mut profile: Profile,
) -> Result<Profile, String> {
    if profile.id.is_empty() {
        profile.id = Uuid::new_v4().to_string();
    }
    if profile.created_at.timestamp() == 0 {
        profile.created_at = Utc::now();
    }

    let mut profiles = state.profiles.lock();
    if let Some(existing) = profiles.iter_mut().find(|p| p.id == profile.id) {
        *existing = profile.clone();
    } else {
        profiles.push(profile.clone());
    }
    persist(&app, &profiles)?;
    Ok(profile)
}

#[tauri::command]
pub fn delete_profile(
    app: AppHandle,
    state: State<'_, ProfileStore>,
    id: String,
) -> Result<(), String> {
    let mut profiles = state.profiles.lock();
    profiles.retain(|p| p.id != id);
    persist(&app, &profiles)
}

/// Read `~/.ssh/config`, parse it, and merge any new entries (deduped by
/// `name`) into the saved profile list. Returns the *full* updated list.
#[tauri::command]
pub fn import_ssh_config(
    app: AppHandle,
    state: State<'_, ProfileStore>,
) -> Result<Vec<Profile>, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let path = PathBuf::from(home).join(".ssh").join("config");
    if !path.exists() {
        return Err(format!("{} not found", path.display()));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("read ssh config: {}", e))?;
    let imported = parse_ssh_config(&content);

    let mut profiles = state.profiles.lock();
    let existing_names: std::collections::HashSet<String> =
        profiles.iter().map(|p| p.name.clone()).collect();

    let mut added = 0;
    for p in imported {
        if !existing_names.contains(&p.name) {
            profiles.push(p);
            added += 1;
        }
    }

    if added > 0 {
        persist(&app, &profiles)?;
    }
    Ok(profiles.clone())
}

// ── Test helpers ──────────────────────────────────────────────────────

#[allow(dead_code)]
pub fn count_by_source(profiles: &[Profile]) -> HashMap<String, usize> {
    let mut m = HashMap::new();
    for p in profiles {
        *m.entry(p.source.clone()).or_insert(0) += 1;
    }
    m
}
