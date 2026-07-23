"use client";

import { useTranslations } from "next-intl";
import { formatDateTime } from "@/utils/date";

export interface JobDetail {
  id: string;
  jobId?: string | null;
  type: string;
  description?: string | null;
  payload: unknown;
  status: string;
  priority: string;
  result: unknown;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

function JsonBlock({ data }: { data: unknown }) {
  const t = useTranslations("Jobs");
  let formatted: string;
  try {
    formatted =
      data === null || data === undefined ? "" : JSON.stringify(data, null, 2);
  } catch {
    return (
      <p className="text-muted-foreground">{t("detail.result.invalidJson")}</p>
    );
  }

  if (!formatted) {
    return <p className="text-muted-foreground">{t("detail.payload.empty")}</p>;
  }

  return (
    <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-4 font-mono text-xs leading-relaxed">
      {formatted}
    </pre>
  );
}

function OverviewField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function JobDetailOverview({ job }: { job: JobDetail }) {
  const t = useTranslations("Jobs");
  const o = t.raw("detail.overview") as Record<string, string>;

  return (
    <dl className="grid w-full grid-cols-1 gap-x-8 gap-y-4 rounded-md border p-6 sm:grid-cols-2 lg:grid-cols-3">
      <OverviewField label={o.id}>
        <span className="font-mono text-xs break-all">{job.id}</span>
      </OverviewField>
      {job.jobId && (
        <OverviewField label={o.jobId}>
          <span className="font-mono text-xs break-all">{job.jobId}</span>
        </OverviewField>
      )}
      <OverviewField label={o.type}>
        <span className="font-mono">{job.type}</span>
      </OverviewField>
      <OverviewField label={o.description}>
        {job.description ?? "-"}
      </OverviewField>
      <OverviewField label={o.status}>
        {t(`status.${job.status}`)}
      </OverviewField>
      <OverviewField label={o.priority}>
        {t(`priority.${job.priority}`)}
      </OverviewField>
      <OverviewField label={o.attempts}>
        {job.attempts} / {job.maxAttempts}
      </OverviewField>
      <OverviewField label={o.maxAttempts}>{job.maxAttempts}</OverviewField>
      <OverviewField label={o.timeoutMs}>{job.timeoutMs}</OverviewField>
      <OverviewField label={o.createdAt}>
        {formatDateTime(job.createdAt)}
      </OverviewField>
      <OverviewField label={o.scheduledAt}>
        {job.scheduledAt ? formatDateTime(job.scheduledAt) : "-"}
      </OverviewField>
      <OverviewField label={o.startedAt}>
        {job.startedAt ? formatDateTime(job.startedAt) : "-"}
      </OverviewField>
      <OverviewField label={o.completedAt}>
        {job.completedAt ? formatDateTime(job.completedAt) : "-"}
      </OverviewField>
    </dl>
  );
}

export function JobDetailPayload({ payload }: { payload: unknown }) {
  const t = useTranslations("Jobs");
  return (
    <div className="flex w-full flex-col gap-2">
      <h3 className="text-sm font-medium">{t("detail.payload.title")}</h3>
      <JsonBlock data={payload} />
    </div>
  );
}

export function JobDetailResult({ job }: { job: JobDetail }) {
  const t = useTranslations("Jobs");

  if (job.status === "FAILED" && job.error) {
    return (
      <div className="flex w-full flex-col gap-2">
        <h3 className="text-sm font-medium">{t("detail.result.errorTitle")}</h3>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-4 font-mono text-xs leading-relaxed text-destructive">
          {job.error}
        </pre>
      </div>
    );
  }

  if (job.status === "COMPLETED") {
    return (
      <div className="flex w-full flex-col gap-2">
        <h3 className="text-sm font-medium">{t("detail.result.title")}</h3>
        <JsonBlock data={job.result} />
      </div>
    );
  }

  return <p className="text-muted-foreground">{t("detail.result.empty")}</p>;
}
