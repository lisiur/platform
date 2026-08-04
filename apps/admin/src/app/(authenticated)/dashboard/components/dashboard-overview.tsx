"use client";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Building2,
  CheckCircle2,
  Layers,
  Users as RolesIcon,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ExecutorStats } from "@/app/(authenticated)/jobs/types";
import { appClient, withApiFeedback } from "@/lib/api";
import { useHasPermission } from "@/lib/api/use-has-permission";
import { useUnreadNotificationCount } from "@/lib/notifications";
import { formatDateTime } from "@/utils/date";
import { StatCard } from "./stat-card";

interface OperationLogItem {
  id: string;
  level: string;
  event: string;
  message: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  createdAt: string;
}

interface AuditLogItem {
  id: string;
  event: string;
  category: string;
  severity: string;
  outcome: string;
  userName: string | null;
  createdAt: string;
}

const LEVEL_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  debug: "outline",
  info: "secondary",
  warn: "default",
  error: "destructive",
};

const SEVERITY_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  info: "secondary",
  warning: "default",
  critical: "destructive",
};

const OUTCOME_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  success: "secondary",
  failure: "destructive",
  denied: "destructive",
};

function JobStatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Icon className={`size-5 ${tone ?? "text-muted-foreground"}`} />
      <div className="min-w-0">
        <p className="font-semibold text-2xl leading-none tabular-nums">
          {value}
        </p>
        <p className="mt-1 truncate text-muted-foreground text-xs">{label}</p>
      </div>
    </div>
  );
}

export function DashboardOverview() {
  const t = useTranslations("Dashboard");
  const canViewUsers = useHasPermission("system/user:list");
  const canViewOrganizations = useHasPermission("system/organization:list");
  const canViewRoles = useHasPermission("system/role:list");
  const canViewApplications = useHasPermission("system/application:list");
  const canViewNotifications = useHasPermission("system/notification:list");
  const canViewOperationLogs = useHasPermission("system/operation-log:list");
  const canViewAuditLogs = useHasPermission("system/audit-log:list");
  const canViewJobs = useHasPermission("system/job:view");
  const { data: unreadCount } =
    useUnreadNotificationCount(canViewNotifications);

  const usersQuery = useQuery({
    queryKey: ["dashboard", "users-count"],
    queryFn: async () => {
      const res = await withApiFeedback(appClient.api.users.$get, {
        showError: false,
      })({ query: { limit: 1, offset: 0 } });
      const data = await res.json();
      return data.total;
    },
    enabled: canViewUsers,
    retry: false,
  });

  const organizationsQuery = useQuery({
    queryKey: ["dashboard", "organizations-count"],
    queryFn: async () => {
      const res = await withApiFeedback(appClient.api.organizations.$get, {
        showError: false,
      })({ query: { limit: 1, offset: 0 } });
      const data = await res.json();
      return data.total;
    },
    enabled: canViewOrganizations,
    retry: false,
  });

  const rolesQuery = useQuery({
    queryKey: ["dashboard", "roles-count"],
    queryFn: async () => {
      const res = await withApiFeedback(appClient.api.roles.$get, {
        showError: false,
      })({ query: { scopePrefix: "system", limit: 1, offset: 0 } });
      const data = await res.json();
      return data.total;
    },
    enabled: canViewRoles,
    retry: false,
  });

  const applicationsQuery = useQuery({
    queryKey: ["dashboard", "applications-count"],
    queryFn: async () => {
      const res = await withApiFeedback(appClient.api.applications.$get, {
        showError: false,
      })({ query: { limit: 1, offset: 0 } });
      const data = await res.json();
      return data.total;
    },
    enabled: canViewApplications,
    retry: false,
  });

  const jobsQuery = useQuery({
    queryKey: ["dashboard", "jobs-stats"],
    queryFn: async (): Promise<ExecutorStats> => {
      const res = await withApiFeedback(appClient.api.jobs.stats.$get, {
        showError: false,
      })();
      return (await res.json()) as ExecutorStats;
    },
    enabled: canViewJobs,
    retry: false,
  });

  const operationLogsQuery = useQuery({
    queryKey: ["dashboard", "operation-logs"],
    queryFn: async () => {
      const res = await withApiFeedback(appClient.api["operation-logs"].$get, {
        showError: false,
      })({ query: { limit: 5, offset: 0 } });
      const data = await res.json();
      return data.logs as OperationLogItem[];
    },
    enabled: canViewOperationLogs,
    retry: false,
  });

  const auditLogsQuery = useQuery({
    queryKey: ["dashboard", "audit-logs"],
    queryFn: async () => {
      const res = await withApiFeedback(appClient.api["audit-logs"].$get, {
        showError: false,
      })({ query: { limit: 5, offset: 0 } });
      const data = await res.json();
      return data.logs as AuditLogItem[];
    },
    enabled: canViewAuditLogs,
    retry: false,
  });

  const operationLogs = operationLogsQuery.data ?? [];
  const auditLogs = auditLogsQuery.data ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {canViewUsers && !usersQuery.isError && (
            <StatCard
              icon={User}
              label={t("statUsers")}
              value={usersQuery.data}
              href="/users"
            />
          )}
          {canViewOrganizations && !organizationsQuery.isError && (
            <StatCard
              icon={Building2}
              label={t("statOrganizations")}
              value={organizationsQuery.data}
              href="/organizations"
            />
          )}
          {canViewRoles && !rolesQuery.isError && (
            <StatCard
              icon={RolesIcon}
              label={t("statRoles")}
              value={rolesQuery.data}
              href="/roles"
            />
          )}
          {canViewApplications && !applicationsQuery.isError && (
            <StatCard
              icon={Layers}
              label={t("statApplications")}
              value={applicationsQuery.data}
              href="/applications"
            />
          )}
          {canViewNotifications && (
            <StatCard
              icon={Bell}
              label={t("statUnread")}
              value={unreadCount}
              href="/notifications"
            />
          )}
        </div>

        {canViewJobs && !jobsQuery.isError && jobsQuery.data && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Activity className="size-5 text-muted-foreground" />
                  <CardTitle>{t("jobsSnapshot")}</CardTitle>
                </div>
                <Link
                  href="/jobs"
                  className="text-primary text-sm hover:underline"
                >
                  {t("viewAll")}
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <JobStatTile
                  icon={Activity}
                  label={t("jobsProcessing")}
                  value={jobsQuery.data.byStatus.PROCESSING}
                  tone="text-blue-500"
                />
                <JobStatTile
                  icon={ShieldCheck}
                  label={t("jobsPending")}
                  value={jobsQuery.data.byStatus.PENDING}
                  tone="text-amber-500"
                />
                <JobStatTile
                  icon={CheckCircle2}
                  label={t("jobsCompleted")}
                  value={jobsQuery.data.byStatus.COMPLETED}
                  tone="text-emerald-500"
                />
                <JobStatTile
                  icon={XCircle}
                  label={t("jobsFailed")}
                  value={jobsQuery.data.byStatus.FAILED}
                  tone="text-red-500"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {(canViewOperationLogs || canViewAuditLogs) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {canViewOperationLogs && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{t("recentOperations")}</CardTitle>
                    <Link
                      href="/logs"
                      className="text-primary text-sm hover:underline"
                    >
                      {t("viewAll")}
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {operationLogs.length === 0 ? (
                    <p className="py-6 text-center text-muted-foreground text-sm">
                      {t("noRecentActivity")}
                    </p>
                  ) : (
                    <Table containerClassName="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[64px]">
                            {t("colLevel")}
                          </TableHead>
                          <TableHead>{t("colRequest")}</TableHead>
                          <TableHead
                            align="right"
                            className="whitespace-nowrap"
                          >
                            {t("colTime")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {operationLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>
                              <Badge
                                variant={LEVEL_VARIANT[log.level] ?? "outline"}
                              >
                                {log.level}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[220px] align-top">
                              <p className="truncate font-mono text-xs">
                                {[log.method, log.path]
                                  .filter(Boolean)
                                  .join(" ") || "\u2014"}
                              </p>
                              <p className="truncate text-muted-foreground text-xs">
                                {log.message ?? log.event}
                              </p>
                            </TableCell>
                            <TableCell
                              align="right"
                              className="text-muted-foreground text-xs whitespace-nowrap"
                            >
                              {formatDateTime(log.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}

            {canViewAuditLogs && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{t("recentAudit")}</CardTitle>
                    <Link
                      href="/logs"
                      className="text-primary text-sm hover:underline"
                    >
                      {t("viewAll")}
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {auditLogs.length === 0 ? (
                    <p className="py-6 text-center text-muted-foreground text-sm">
                      {t("noRecentActivity")}
                    </p>
                  ) : (
                    <Table containerClassName="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">
                            {t("colSeverity")}
                          </TableHead>
                          <TableHead>{t("colEvent")}</TableHead>
                          <TableHead className="w-[80px]">
                            {t("colOutcome")}
                          </TableHead>
                          <TableHead
                            align="right"
                            className="whitespace-nowrap"
                          >
                            {t("colTime")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>
                              <Badge
                                variant={
                                  SEVERITY_VARIANT[log.severity] ?? "outline"
                                }
                              >
                                {log.severity}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[220px] align-top">
                              <p className="truncate font-medium">
                                {log.event}
                              </p>
                              <p className="truncate text-muted-foreground text-xs">
                                {log.userName ?? log.category}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  OUTCOME_VARIANT[log.outcome] ?? "outline"
                                }
                              >
                                {log.outcome}
                              </Badge>
                            </TableCell>
                            <TableCell
                              align="right"
                              className="text-muted-foreground text-xs whitespace-nowrap"
                            >
                              {formatDateTime(log.createdAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
