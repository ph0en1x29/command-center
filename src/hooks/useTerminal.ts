import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
}

// Ghostty default theme
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

  // Fit the terminal to its container, then subtract 1 column to
  // prevent subpixel-rounding overflow. FitAddon uses parseInt() on
  // the parent's computed width (truncating fractional CSS pixels)
  // and Math.floor(width / cellWidth), but the canvas renderer may
  // round cell positions differently, causing the rightmost column
  // to overflow by 1 character. Subtracting 1 col is the same
  // approach VS Code's terminal uses for this exact issue.
  const safeFit = useCallback(() => {
    try {
      const fit = fitRef.current;
      const term = termRef.current;
      if (!fit || !term) return;
      fit.fit();
      if (term.cols > 2) {
        term.resize(term.cols - 1, term.rows);
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

    // Only fit ONCE, after fonts are loaded. No early fit with wrong
    // metrics, no delayed retries. The terminal stays at 80x24 until
    // this fires, then gets the correct size in one shot.
    document.fonts.ready.then(() => {
      requestAnimationFrame(() => {
        term.options.fontFamily = term.options.fontFamily;
        safeFit();
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
  }, [options.fontSize, safeFit]);

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
    fit: safeFit,
    focus,
    dispose,
    terminal: termRef,
  };
}
