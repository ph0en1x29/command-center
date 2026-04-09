import { STATUS_COLORS, type SessionStatus } from "../types";

interface StatusDotProps {
  status: SessionStatus;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
}

export function StatusDot({ status, size = "sm", pulse = true }: StatusDotProps) {
  const color = STATUS_COLORS[status];
  const sizeMap = { sm: "w-2 h-2", md: "w-2.5 h-2.5", lg: "w-3 h-3" };
  const shouldPulse = pulse && (status === "Thinking" || status === "Connecting" || status === "RunningCommand");

  return (
    <span className="relative inline-flex">
      {shouldPulse && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-40 animate-ping"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className={`relative inline-flex rounded-full ${sizeMap[size]}`}
        style={{ backgroundColor: color }}
      />
    </span>
  );
}
