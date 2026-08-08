// Standalone type declarations for the updater daemon. Intentionally NOT
// imported from @repo/shared so the daemon builds and bundles with zero
// workspace dependencies and ships as a single self-contained file. The shapes
// mirror packages/shared/src/events.ts (UpdatePhase / ApplyUpdateMode) and the
// service's UpdateStatus contract byte-for-byte.

export type UpdatePhase =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ApplyUpdateMode = "update" | "redeploy";

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export interface UpdateStatus {
  phase: UpdatePhase;
  step: string;
  message: string;
  targetTag: string | null;
  mode: ApplyUpdateMode | null;
  progress: DownloadProgress | null;
  startedAt: string | null;
  updatedAt: string | null;
}

export interface ApplyRequest {
  tarballUrl: string;
  targetTag: string;
  mode: ApplyUpdateMode;
}

export interface ApplyResponse {
  jobId: string;
}
