import { useEffect, useState } from "react";

/**
 * Tiny re-render trigger. Useful for derived "live" displays like
 * "uptime: 1h 23m" that need to recompute against Date.now() periodically
 * without storing the value in real state.
 */
export function useTick(intervalMs: number = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}
