import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";

interface UseTerminalOptions {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
}

// Ghostty default theme — pulled from ghostty-org/ghostty src/terminal/color.zig
const GHOSTTY_THEME = {
  background: "#282c34",
  foreground: "#ffffff",
  cursor: "#ffffff",
  cursorAccent: "#282c34",
  selectionBackground: "#3e4451",
  selectionForeground: "#ffffff",
  // ANSI 0-7
  black: "#1d1f21",
  red: "#cc6666",
  green: "#b5bd68",
  yellow: "#f0c674",
  blue: "#81a2be",
  magenta: "#b294bb",
  cyan: "#8abeb7",
  white: "#c5c8c6",
  // ANSI 8-15 (bright)
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

  const initTerminal = useCallback(() => {
    if (!terminalRef.current || termRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: options.fontSize || 12,
      fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
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

    // Try to upgrade to WebGL renderer for ~10x perf. Fall back silently
    // to the default canvas/DOM renderer if it can't load (e.g. headless test).
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // canvas renderer is fine
    }

    // Wait for fonts (JetBrains Mono loaded via Google Fonts with display=swap)
    // before fitting. Without this, xterm.js measures cell dimensions using a
    // fallback monospace font, then the browser swaps in JetBrains Mono with
    // different metrics — causing text overlap and misaligned rendering.
    // This mirrors how Ghostty waits for stable font metrics before computing
    // the terminal grid.
    const fitAfterFonts = () => {
      requestAnimationFrame(() => {
        try {
          // Force xterm.js to re-measure character cells by re-assigning
          // fontFamily. This clears the glyph atlas and recalculates all
          // cell dimensions based on the now-loaded web font.
          term.options.fontFamily = term.options.fontFamily;
          fitAddon.fit();
        } catch {}
      });
    };

    if (document.fonts.status === "loaded") {
      fitAfterFonts();
    } else {
      // Fit immediately with whatever font is available so the terminal
      // isn't blank, then re-fit once the real font arrives.
      requestAnimationFrame(() => {
        try { fitAddon.fit(); } catch {}
      });
      document.fonts.ready.then(fitAfterFonts);
    }

    if (options.onData) {
      term.onData(options.onData);
    }

    if (options.onResize) {
      term.onResize(({ cols, rows }) => {
        options.onResize?.(cols, rows);
      });
    }

    termRef.current = term;
    fitRef.current = fitAddon;
  }, [options.fontSize]);

  const write = useCallback((data: string) => {
    termRef.current?.write(data);
  }, []);

  const fit = useCallback(() => {
    try {
      fitRef.current?.fit();
    } catch {}
  }, []);

  const focus = useCallback(() => {
    termRef.current?.focus();
  }, []);

  const dispose = useCallback(() => {
    try {
      termRef.current?.dispose();
    } catch {
      // WebGL addon may throw during StrictMode double-unmount cleanup
      // when it accesses _terminal._core._store on an already-disposed terminal.
      // Safe to swallow — the terminal is being torn down anyway.
    }
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
