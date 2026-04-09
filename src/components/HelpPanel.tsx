import { X, Keyboard, Server, Zap, Coffee, Radio, Move, Layers, Shield, RotateCw, Save, Bell } from "lucide-react";

interface HelpPanelProps {
  onClose: () => void;
}

const SHORTCUTS: Array<[string, string]> = [
  ["⌘N", "New session (or click + in sidebar)"],
  ["⌘?", "Open this help"],
  ["⌘1", "Focus layout — single full-bleed terminal"],
  ["⌘2", "Split — two side-by-side"],
  ["⌘3", "Stack — two stacked top/bottom"],
  ["⌘4", "Grid — 2×2"],
  ["⌘5", "Free — drag panels anywhere, resize from corners"],
  ["⌘6", "Monitor — auto-tile every session"],
  ["⌘\\", "Toggle sidebar"],
  ["⌘⇧O", "Toggle overview panel"],
  ["⌘⇧B", "Toggle broadcast mode (mirror keystrokes to all visible panels)"],
];

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-2 text-[12px] font-semibold text-accent">
        <Icon size={13} />
        {title}
      </h3>
      <div className="text-[12px] text-white/65 leading-relaxed pl-5">{children}</div>
    </section>
  );
}

export function HelpPanel({ onClose }: HelpPanelProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[680px] max-h-[85vh] flex flex-col bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white/95">Command Center — Help</h2>
            <p className="text-[11px] text-white/40 mt-0.5">
              Multi-session terminal with Claude Code awareness
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Quick start */}
          <Section icon={Zap} title="Quick start">
            <ol className="list-decimal list-outside ml-4 space-y-1">
              <li>
                Press <kbd className="px-1 bg-surface-1 rounded text-[10px]">⌘N</kbd> to open the
                New Session modal.
              </li>
              <li>
                In the SSH tab, click{" "}
                <span className="text-white/85 font-medium">Import ~/.ssh/config</span> to pull in
                every Host block from your existing config.
              </li>
              <li>
                Click any profile chip → review the form → click{" "}
                <span className="text-white/85 font-medium">Connect</span>.
              </li>
              <li>
                Press <kbd className="px-1 bg-surface-1 rounded text-[10px]">⌘5</kbd> to switch to
                Free layout; drag panels by their headers, resize from corners.
              </li>
            </ol>
          </Section>

          {/* Layouts */}
          <Section icon={Layers} title="Layouts">
            Six modes — pick whichever matches your task. Sizes auto-save per layout to{" "}
            <span className="font-mono text-white/40">localStorage</span> so dragging dividers in
            Split, Stack, or Grid sticks. Free layout positions persist per session id.
            <ul className="mt-1.5 space-y-0.5 text-white/45 text-[11px]">
              <li>
                <span className="text-white/70">Focus</span> · single fullscreen terminal
              </li>
              <li>
                <span className="text-white/70">Split / Stack</span> · two terminals; resize the
                divider
              </li>
              <li>
                <span className="text-white/70">Grid</span> · 2×2 with independent row + column
                drag handles
              </li>
              <li>
                <span className="text-white/70">Free</span> · drag panels by header, resize from
                corners; uses a 12-column snap grid
              </li>
              <li>
                <span className="text-white/70">Monitor</span> · auto-tile every session for
                glance-overview
              </li>
            </ul>
          </Section>

          {/* Profiles */}
          <Section icon={Save} title="Profiles">
            Stored at{" "}
            <span className="font-mono text-white/40 text-[10px]">
              ~/Library/Application Support/com.jay.commandcenter/profiles.json
            </span>
            . Each profile carries everything Command Center needs to connect: host, user, identity,
            optional working dir, optional <span className="font-mono text-white/55">startup_command</span>{" "}
            (e.g. <span className="font-mono text-white/55">claude</span> to drop straight into Claude
            Code on connect), an optional <span className="font-mono text-white/55">tag</span>{" "}
            (prod/staging/dev/personal — drives the panel border color), and toggles for{" "}
            <span className="font-mono text-white/55">wrap_in_tmux</span> and{" "}
            <span className="font-mono text-white/55">auto_reconnect</span>.
            <p className="mt-1.5">
              <strong className="text-white/75">SSH config import</strong> reads{" "}
              <span className="font-mono text-white/55">~/.ssh/config</span> and creates one profile
              per Host block. Imported profiles connect via the alias (e.g.{" "}
              <span className="font-mono">ssh server</span>) so your config's{" "}
              <span className="font-mono">UseKeychain</span>, <span className="font-mono">ProxyJump</span>,
              etc. are honored.
            </p>
          </Section>

          {/* Tags / safety */}
          <Section icon={Shield} title="Color tags & production safety">
            Profiles can carry a tag — <span className="text-red-400 font-medium">prod</span>,{" "}
            <span className="text-amber-400 font-medium">staging</span>,{" "}
            <span className="text-blue-400 font-medium">dev</span>,{" "}
            <span className="text-green-400 font-medium">personal</span>. Tagged sessions get a
            colored border + corner badge so you can never miss which environment you're typing
            into. <span className="text-red-400">prod</span> uses an unmistakable red ring — set this
            on anything you can't easily undo.
          </Section>

          {/* Broadcast */}
          <Section icon={Radio} title="Broadcast mode">
            Click the <span className="text-red-400 font-medium">Broadcast</span> button in the
            layout bar (or press <kbd className="px-1 bg-surface-1 rounded text-[10px]">⌘⇧B</kbd>)
            to mirror your keystrokes into every visible panel at once. Every targeted panel gets a
            red ring; the status bar shows{" "}
            <span className="font-mono text-red-400">BCAST N</span>. Use it to run the same Claude
            prompt across N servers, or roll out a fix to a fleet.{" "}
            <strong className="text-white/75">Toggle off when done.</strong>
          </Section>

          {/* Keep awake */}
          <Section icon={Coffee} title="Keep Awake">
            Each panel header has a coffee icon. Click it to enable a per-session heartbeat that
            sends a NUL byte every 30 seconds. This prevents disconnects from middlebox NAT
            timeouts, sshd <span className="font-mono">ClientAliveInterval</span>, and shell{" "}
            <span className="font-mono">$TMOUT</span>.
          </Section>

          {/* tmux + auto-reconnect */}
          <Section icon={RotateCw} title="Surviving network drops">
            Two tools, used together when possible:
            <ul className="list-disc list-outside ml-4 mt-1 space-y-1">
              <li>
                <strong className="text-white/75">Wrap in tmux</strong> — profile checkbox. The
                connect command becomes{" "}
                <span className="font-mono text-[10px]">tmux new-session -A -s cc_NAME …</span> so
                even if your Mac sleeps for hours, the remote process keeps running and you reattach
                where you left off.
              </li>
              <li>
                <strong className="text-white/75">Auto-reconnect</strong> — profile checkbox. If
                the PTY dies (network drop, SSH timeout), Command Center automatically respawns
                with exponential backoff (2s → 60s) and shows{" "}
                <span className="text-status-thinking">Reconnecting…</span> in the panel header.
                Pair with tmux to actually pick up where you left off.
              </li>
            </ul>
          </Section>

          {/* Notifications + tray */}
          <Section icon={Bell} title="Notifications & menu bar">
            macOS native notifications fire on noteworthy state transitions: an Error, an
            unexpected disconnect, a successful reconnect, and when Claude transitions from
            Thinking → Idle (so you can leave the window backgrounded). The macOS{" "}
            <strong className="text-white/75">menu bar tray icon</strong> shows a live list of all
            sessions with their state — click any entry to bring the window forward and switch to
            that session.
          </Section>

          {/* Activity badge */}
          <Section icon={Server} title="Activity-since-viewed badge">
            Panels that aren't currently active will show a small{" "}
            <span className="text-accent">+1.2 KB</span> badge in the top-left when new output has
            arrived since you last had them in focus. Click into a panel to "mark as read".
          </Section>

          {/* Export */}
          <Section icon={Save} title="Export transcript">
            Every session is silently transcribed to{" "}
            <span className="font-mono text-white/40 text-[10px]">
              ~/Library/Application Support/com.jay.commandcenter/transcripts/&lt;id&gt;.log
            </span>{" "}
            (capped at 5 MB, truncated from the front when full). The copy icon in the panel
            header dumps the current transcript to your clipboard as Markdown for sharing.
          </Section>

          {/* Shortcuts */}
          <Section icon={Keyboard} title="Keyboard shortcuts">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1">
              {SHORTCUTS.map(([keys, desc]) => (
                <div key={keys} className="flex items-center gap-3">
                  <kbd className="px-1.5 py-0.5 bg-surface-1 rounded text-[10px] font-mono text-white/70 min-w-[40px] text-center">
                    {keys}
                  </kbd>
                  <span className="text-[11px] text-white/55 flex-1">{desc}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-surface-1/50 text-[10px] text-white/30">
          Hover any icon or button in the app for an inline tooltip explaining what it does. This
          help is always reachable via the <span className="text-white/50">?</span> in the title
          bar or <kbd className="px-1 bg-surface-2 rounded">⌘?</kbd>.
        </div>
      </div>
    </div>
  );
}
