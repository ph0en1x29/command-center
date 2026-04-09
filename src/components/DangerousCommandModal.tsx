import { useState, useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface DangerousCommandModalProps {
  command: string;
  sessionName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DangerousCommandModal({
  command,
  sessionName,
  onConfirm,
  onCancel,
}: DangerousCommandModalProps) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmed = typed.trim() === sessionName.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && confirmed) {
      onConfirm();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="w-[440px] bg-surface-2 border-2 border-red-500/60 rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-red-500/30 bg-red-500/10">
          <AlertTriangle size={20} className="text-red-400 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-red-300">
              Potentially destructive command detected
            </h2>
            <p className="text-[11px] text-white/50 mt-0.5">
              This was intercepted before being sent to the shell.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-white/40 mb-1 uppercase tracking-wider">
              Command
            </label>
            <pre className="px-3 py-2 bg-surface-0 border border-red-500/30 rounded-lg text-[13px] text-red-300 font-mono overflow-x-auto">
              {command}
            </pre>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-white/40 mb-1 uppercase tracking-wider">
              Session
            </label>
            <p className="text-[13px] text-white/80 font-medium">{sessionName}</p>
          </div>

          <div className="pt-2">
            <label className="block text-[11px] text-white/50 mb-1.5">
              Type <span className="font-mono text-red-300 font-bold">{sessionName}</span> to confirm:
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={sessionName}
              className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-white/90 placeholder:text-white/15 focus:outline-none focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20 transition-all font-mono"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-end gap-2 border-t border-border bg-surface-1/50">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
          >
            Cancel (Esc)
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
              confirmed
                ? "bg-red-500 text-white hover:bg-red-400 shadow-md shadow-red-500/20"
                : "bg-white/5 text-white/20 cursor-not-allowed"
            }`}
          >
            Execute
          </button>
        </div>
      </div>
    </div>
  );
}
