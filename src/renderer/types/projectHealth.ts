export type ProjectHealthStatus =
  | "ready"
  | "locked"
  | "missing-folder"
  | "no-launch-profile"
  | "approval-required"
  | "sync-conflict"
  | "command-failed";

export type SyncUiState = {
  status: "idle" | "syncing" | "failed" | "offline";
  lastSyncedAt?: string;
  lastError?: string;
};