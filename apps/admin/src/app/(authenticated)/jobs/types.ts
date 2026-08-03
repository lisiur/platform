export interface ExecutorStats {
  queueSize: number;
  pending: number;
  concurrency: number;
  nextScheduledAt: string | null;
  byStatus: {
    PENDING: number;
    PROCESSING: number;
    COMPLETED: number;
    FAILED: number;
  };
}
