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

  // Custom fit that bypasses FitAddon's resize entirely.
  // FitAddon calls terminal.resize(N) then we'd call resize(N-1),
  // producing TWO SIGWINCH signals where the first (wrong) one can
  // win the race. Instead, we calculate dimensions ourselves using
  // getBoundingClientRect (precise floats, no parseInt truncation)
  // and issue a single resize(N-1) call.
  const fit = useCallback(() => {
    try {
      const term = termRef.current;
      const container = terminalRef.current;
      if (!term || !container) return;

      const core = (term as any)._core;
      const dims = core._renderService?.dimensions;
      if (!dims || dims.css.cell.width === 0 || dims.css.cell.height === 0) return;

      const scrollbarWidth = core.viewport?.scrollBarWidth ?? 0;

      // getBoundingClientRect gives precise floating-point px — no
      // parseInt truncation like FitAddon uses.
      const rect = container.getBoundingClientRect();
      const availableWidth = rect.width - scrollbarWidth;
      const availableHeight = rect.height;

      // Subtract 1 col to prevent subpixel rounding overflow at the
      // right edge. This matches how real terminal emulators handle
      // fractional remainders — they leave a small gap rather than
      // risk characters overflowing.
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

    // FitAddon is still loaded so xterm internals (viewport, render
    // service) are initialized, but we never call fitAddon.fit() —
    // we use our own fit() that issues a single correct resize.
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);

    termRef.current = term;
    fitRef.current = fitAddon;

    // Fit once after fonts are loaded.
    document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        term.options.fontFamily = term.options.fontFamily;
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
    return () => {
      dispose();
    };
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
