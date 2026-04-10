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

  const remeasureFont = useCallback((term: Terminal | null = termRef.current) => {
    if (!term) return;
    try {
      term.options.fontFamily = term.options.fontFamily;
    } catch {}
  }, []);

  const fit = useCallback(() => {
    const term = termRef.current;
    if (!term) return null;

    remeasureFont(term);

    try {
      let cols: number | undefined;
      let rows: number | undefined;

      // ── Ghostty-style grid sizing ──────────────────────────────────
      // FitAddon uses a hardcoded FALLBACK_SCROLL_BAR_WIDTH (~15 px)
      // that mis-reports columns on macOS overlay scrollbars (0 px real
      // width).  Instead, measure the actual cell dimensions from
      // xterm's render service, the actual container size, and the
      // actual scrollbar width — then floor-divide so we never report
      // more cols/rows than physically fit.
      const core = (term as any)._core;
      const renderDims = core?._renderService?.dimensions;
      const el = term.element;

      if (renderDims?.css?.cell?.width > 0 && renderDims?.css?.cell?.height > 0 && el?.parentElement) {
        const cellW: number = renderDims.css.cell.width;
        const cellH: number = renderDims.css.cell.height;

        // clientWidth is integer (excludes border); getBoundingClientRect
        // gives sub-pixel float.  Take the minimum so we never over-count
        // when the browser rounds clientWidth up on a fractional layout.
        const rect = el.parentElement.getBoundingClientRect();
        const parentW = Math.min(el.parentElement.clientWidth, rect.width);
        const parentH = Math.min(el.parentElement.clientHeight, rect.height);

        // .xterm element padding (usually 0)
        const cs = window.getComputedStyle(el);
        const padH = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);

        // Real scrollbar width (0 on macOS overlay scrollbars)
        const viewport = el.querySelector('.xterm-viewport') as HTMLElement | null;
        const scrollbarW = viewport ? viewport.offsetWidth - viewport.clientWidth : 0;

        // ── 1 px safety margin ──────────────────────────────────────
        // Ghostty sizes its surface to exactly cols*cellW and turns the
        // remainder into padding.  We can't resize the container, so
        // instead reserve 1 CSS px before dividing.  This absorbs:
        //   • IEEE 754 edge: floor(w/cw)*cw can exceed w by a fraction
        //   • clientWidth rounding up a fractional layout width
        //   • sub-pixel font rendering needing a sliver of extra space
        // Cost: ≤1 px of empty space at the right edge (invisible).
        const availW = parentW - padH - scrollbarW - 1;
        const availH = parentH - padV;

        cols = Math.max(2, Math.floor(availW / cellW));
        rows = Math.max(1, Math.floor(availH / cellH));
      }

      // Fallback to FitAddon when render dimensions aren't available yet
      // (e.g. before the first paint)
      if (cols == null || rows == null) {
        const fitAddon = fitRef.current;
        if (!fitAddon) return null;
        const proposed = fitAddon.proposeDimensions();
        if (!proposed) return null;
        cols = proposed.cols;
        rows = proposed.rows;
      }

      if (term.cols !== cols || term.rows !== rows) {
        term.resize(cols, rows);
      }
      return { cols: term.cols, rows: term.rows };
    } catch {
      return null;
    }
  }, [remeasureFont]);

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
      fontFamily: '"JetBrains Mono", "Fira Code", "DejaVu Sans Mono", Menlo, "SF Mono", monospace',
      fontWeight: "400",
      lineHeight: 1.15,
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

    const fontsReady = typeof document !== "undefined" && "fonts" in document
      ? document.fonts.ready
      : Promise.resolve();

    fontsReady.then(() => {
      requestAnimationFrame(() => {
        remeasureFont(term);
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
  }, [options.fontSize, fit, remeasureFont]);

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
