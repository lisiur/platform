"use client";

import { useQuery } from "@tanstack/react-query";
import { appClient, withApiFeedback } from "@/lib/api";

export interface ProjectMemberRow {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    avatar: string | null;
  } | null;
}

export interface QianlaiProject {
  id: string;
  ledgerId: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  members: ProjectMemberRow[];
  entryCount: number;
}

export interface SettlementRow {
  userId: string;
  name: string;
  avatar: string | null;
  paid: number;
  share: number;
  balance: number;
}

export interface ProjectReport {
  project: {
    id: string;
    ledgerId: string;
    name: string;
    status: "active" | "archived";
    startDate: string | null;
    endDate: string | null;
  };
  statement: {
    income: Array<{
      id: string;
      name: string | null;
      code: string | null;
      type: string;
      sortOrder: number;
      balance: number;
    }>;
    expense: Array<{
      id: string;
      name: string | null;
      code: string | null;
      type: string;
      sortOrder: number;
      balance: number;
    }>;
    totalIncome: number;
    totalExpense: number;
    net: number;
  };
  settlement: SettlementRow[];
  totals: { entries: number };
}

/** Loads the active ledger's projects (guests receive only their own). */
export function useProjects(ledgerId: string | undefined, enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: ["qianlai", "projects", ledgerId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].projects.$get,
      )({ param: { ledgerId: ledgerId ?? "" } });
      return (await res.json()) as { projects: QianlaiProject[] };
    },
    enabled: enabled && !!ledgerId,
  });
  return { projects: data?.projects ?? [], isLoading };
}

/** Loads the selected project's income/expense statement and settlement. */
export function useProjectReport(
  ledgerId: string | undefined,
  projectId: string | undefined,
  enabled = true,
) {
  const { data, isLoading } = useQuery({
    queryKey: ["qianlai", "project-report", ledgerId, projectId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].projects[":projectId"]
          .report.$get,
      )({ param: { ledgerId: ledgerId ?? "", projectId: projectId ?? "" } });
      return (await res.json()) as ProjectReport;
    },
    enabled: enabled && !!ledgerId && !!projectId,
  });
  return { report: data, isLoading };
}
