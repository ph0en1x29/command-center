import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
}

const GHOSTTY_THEME = {
  background: "#282c34",
  foreground: "#ffffff",
  cursor: "#ffffff",
  cursorAccent: "#282c34",
  selectionBackground: "#3e4451",
  selectionForeground: "#ffffff",
  black: "#1d1f21",
  red: "#cc6666",
  green: "#b5bd68",
  yellow: "#f0c674",
  blue: "#81a2be",
  magenta: "#b294bb",
  cyan: "#8abeb7",
  white: "#c5c8c6",
  brightBlack: "#666666",
  brightRed: "#d54e53",
  brightGreen: "#b9ca4a",
  brightYellow: "#e7c547",
  brightBlue: "#7aa6da",
  brightMagenta: "#c397d8",
  brightCyan: "#70c0b1",
  brightWhite: "#eaeaea",
};

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const fit = useCallback(() => {
    try {
      const term = termRef.current;
      const container = terminalRef.current;
      if (!term || !container) return;

      const core = (term as any)._core;
      const dims = core._renderService?.dimensions;
      if (!dims || dims.css.cell.width === 0 || dims.css.cell.height === 0) return;

      // No custom scrollbar CSS — using native macOS overlay scrollbar
      // which takes 0px layout space. No scrollbar subtraction needed.
      const rect = container.getBoundingClientRect();
      const availableWidth = rect.width;
      const availableHeight = rect.height;

      const cols = Math.max(2, Math.floor(availableWidth / dims.css.cell.width) - 1);
      const rows = Math.max(1, Math.floor(availableHeight / dims.css.cell.height));

      if (cols !== term.cols || rows !== term.rows) {
        core._renderService.clear();
        term.resize(cols, rows);
      }
    } catch {}
  }, []);

  const initTerminal = useCallback(() => {
    if (!terminalRef.current) return;

    if (termRef.current) {
      try { termRef.current.dispose(); } catch {}
      termRef.current = null;
      fitRef.current = null;
    }

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: options.fontSize || 12,
      fontFamily: '"JetBrains Mono", Menlo, "SF Mono", monospace',
      fontWeight: "400",
      lineHeight: 1.0,
      letterSpacing: 0,
      theme: GHOSTTY_THEME,
      allowProposedApi: true,
      scrollback: 10000,
      macOptionIsMeta: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);

    termRef.current = term;
    fitRef.current = fitAddon;

    document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        try {
          term.options.fontFamily = term.options.fontFamily;
        } catch {}
        fit();
      });
    });

    if (options.onData) {
      term.onData(options.onData);
    }

    if (options.onResize) {
      term.onResize(({ cols, rows }) => {
        options.onResize?.(cols, rows);
      });
    }
  }, [options.fontSize, fit]);

  const write = useCallback((data: string) => {
    termRef.current?.write(data);
  }, []);

  const focus = useCallback(() => {
    termRef.current?.focus();
  }, []);

  const dispose = useCallback(() => {
    try {
      termRef.current?.dispose();
    } catch {}
    termRef.current = null;
    fitRef.current = null;
  }, []);

  useEffect(() => {
    return () => dispose();
  }, [dispose]);

  return {
    terminalRef,
    initTerminal,
    write,
    fit,
    focus,
    dispose,
    terminal: termRef,
  };
}
