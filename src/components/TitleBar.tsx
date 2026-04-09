import { Terminal, HelpCircle } from "lucide-react";

interface TitleBarProps {
  onShowHelp: () => void;
}

/**
 * Custom title bar that sits underneath the native macOS traffic lights
 * (provided by titleBarStyle: "Overlay" + hiddenTitle: true).
 */
export function TitleBar({ onShowHelp }: TitleBarProps) {
  return (
    <div
      className="h-10 flex items-center justify-between bg-surface-1/80 backdrop-blur-md border-b border-border select-none"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2 pl-20" data-tauri-drag-region>
        <Terminal size={14} className="text-accent opacity-80" />
        <span className="text-[12px] font-medium text-white/60 tracking-wide">
          Command Center
        </span>
      </div>

      <div className="flex items-center pr-3">
        <button
          onClick={onShowHelp}
          onMouseDown={(e) => e.stopPropagation()}
          title="Help / Getting started (⌘?)"
          className="p-1.5 rounded text-white/40 hover:text-accent hover:bg-white/5 transition-colors"
        >
          <HelpCircle size={14} />
        </button>
      </div>
    </div>
  );
}
