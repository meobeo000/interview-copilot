import type { AppStatus } from "../../shared/types";

const statusLabel: Record<AppStatus, string> = {
  Idle: "Idle",
  Listening: "Listening",
  Processing: "Processing",
  Answering: "Answering",
  Error: "Error"
};

export function StatusPill({ status }: { status: AppStatus }) {
  return <span className={`status status-${status.toLowerCase()}`}>{statusLabel[status]}</span>;
}
