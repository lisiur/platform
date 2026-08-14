"use client";

import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui";
import {
  BadgeCheck,
  CircleAlert,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { appClient } from "@/lib/api";

const PAGE_SIZE = 100;
const MINUTES_PER_DAY = 1440;

type TimeInterval = [number, number];

interface AgentSubAgent {
  label: string;
  modelId: string;
}

interface AgentRow {
  id: string;
  code: string;
  name: string;
  status: string;
  subAgents: Record<string, AgentSubAgent>;
}

interface ModelRow {
  id: string;
  providerId: string;
  modelId: string;
  enabled: boolean;
}

interface ProviderRow {
  id: string;
  name: string;
  enabled: boolean;
}

interface AccountRow {
  id: string;
  providerIds: string[];
  name: string;
  status: string;
  concurrencyLimit: number;
}

interface KeyRow {
  id: string;
  accountId: string;
  status: string;
  expiresAt: string | null;
}

interface PricingPolicyItem {
  input: number;
  cachedInput: number;
  output: number;
  startMinutes: number;
  endMinutes: number;
}

interface PricingRow {
  id: string;
  modelId: string;
  accountId: string;
  timeZone: string;
  policy: PricingPolicyItem[];
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface Snapshot {
  agents: AgentRow[];
  models: ModelRow[];
  providers: ProviderRow[];
  accounts: AccountRow[];
  keys: KeyRow[];
  pricing: PricingRow[];
}

type IssueKind = "model" | "key" | "pricing";

interface CheckIssue {
  affected: Array<{
    agentCode: string;
    agentName: string;
    subAgentKey: string;
    subAgentLabel: string;
  }>;
  requiredModelId: string;
  kind: IssueKind;
  reason: string;
  providerName?: string;
}

async function fetchAllPages<T>(
  fetchPage: (offset: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  for (;;) {
    const { items: pageItems, total } = await fetchPage(offset);
    items.push(...pageItems);
    offset += pageItems.length;
    if (offset >= total || pageItems.length === 0) break;
  }
  return items;
}

async function loadSnapshot(): Promise<Snapshot> {
  const [agents, models, providers, accounts, keys, pricing] =
    await Promise.all([
      fetchAllPages(async (offset) => {
        const res = await appClient.api.ai.agents.$get({
          query: { limit: PAGE_SIZE, offset },
        });
        if (!res.ok) throw new Error("Failed to load agents");
        const data = await res.json();
        return { items: data.agents, total: data.total };
      }),
      fetchAllPages(async (offset) => {
        const res = await appClient.api.ai.models.$get({
          query: { limit: PAGE_SIZE, offset },
        });
        if (!res.ok) throw new Error("Failed to load models");
        const data = await res.json();
        return { items: data.models, total: data.total };
      }),
      fetchAllPages(async (offset) => {
        const res = await appClient.api.ai.providers.$get({
          query: { limit: PAGE_SIZE, offset },
        });
        if (!res.ok) throw new Error("Failed to load providers");
        const data = await res.json();
        return { items: data.providers, total: data.total };
      }),
      fetchAllPages(async (offset) => {
        const res = await appClient.api.ai.accounts.$get({
          query: { limit: PAGE_SIZE, offset },
        });
        if (!res.ok) throw new Error("Failed to load accounts");
        const data = await res.json();
        return { items: data.accounts, total: data.total };
      }),
      fetchAllPages(async (offset) => {
        const res = await appClient.api.ai.keys.$get({
          query: { limit: PAGE_SIZE, offset },
        });
        if (!res.ok) throw new Error("Failed to load keys");
        const data = await res.json();
        return { items: data.keys, total: data.total };
      }),
      fetchAllPages(async (offset) => {
        const res = await appClient.api.ai["model-pricing"].$get({
          query: { limit: PAGE_SIZE, offset },
        });
        if (!res.ok) throw new Error("Failed to load pricing");
        const data = await res.json();
        return { items: data.pricing, total: data.total };
      }),
    ]);
  return { agents, models, providers, accounts, keys, pricing };
}

function isKeyActive(key: KeyRow, now: Date): boolean {
  if (key.status !== "active") return false;
  if (!key.expiresAt) return true;
  return new Date(key.expiresAt).getTime() > now.getTime();
}

function getMinutesInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  return hour * 60 + minute;
}

function normalizeTimeRange(start: number, end: number): TimeInterval[] {
  if (start === 0 && end === MINUTES_PER_DAY) return [[0, MINUTES_PER_DAY]];
  if (start < end) return [[start, end]];
  const intervals: TimeInterval[] = [[start, MINUTES_PER_DAY]];
  if (end > 0) intervals.push([0, end]);
  return intervals;
}

function isActivePricing(row: PricingRow, now: Date): boolean {
  if (new Date(row.effectiveFrom).getTime() > now.getTime()) return false;
  if (row.effectiveTo && new Date(row.effectiveTo).getTime() <= now.getTime()) {
    return false;
  }
  const localMinutes = getMinutesInTimeZone(now, row.timeZone);
  return row.policy.some((item) =>
    normalizeTimeRange(item.startMinutes, item.endMinutes).some(
      ([start, end]) => start <= localMinutes && localMinutes < end,
    ),
  );
}

function buildIssues(snapshot: Snapshot): {
  issues: CheckIssue[];
  checkedAgents: number;
} {
  const issues: CheckIssue[] = [];
  const bySignature = new Map<string, CheckIssue>();
  const signatureOf = (issue: CheckIssue) =>
    [
      issue.kind,
      issue.reason,
      issue.requiredModelId,
      issue.providerName ?? "",
    ].join("|");
  const pushIssue = (issue: CheckIssue) => {
    const signature = signatureOf(issue);
    const existing = bySignature.get(signature);
    if (existing) {
      for (const entry of issue.affected) {
        if (
          !existing.affected.some(
            (e) =>
              e.agentCode === entry.agentCode &&
              e.subAgentKey === entry.subAgentKey,
          )
        ) {
          existing.affected.push(entry);
        }
      }
      return;
    }
    bySignature.set(signature, issue);
    issues.push(issue);
  };
  const providerById = new Map(snapshot.providers.map((p) => [p.id, p]));
  const keysByAccount = new Map<string, KeyRow[]>();
  for (const key of snapshot.keys) {
    const list = keysByAccount.get(key.accountId) ?? [];
    list.push(key);
    keysByAccount.set(key.accountId, list);
  }
  const now = new Date();
  let checkedAgents = 0;

  for (const agent of snapshot.agents) {
    if (agent.status !== "active") continue;
    const subAgents = agent.subAgents ?? {};
    if (Object.keys(subAgents).length === 0) continue;
    checkedAgents += 1;

    for (const [subAgentKey, subAgent] of Object.entries(subAgents)) {
      const requiredModelId = subAgent.modelId;
      const affected = [
        {
          agentCode: agent.code,
          agentName: agent.name,
          subAgentKey,
          subAgentLabel: subAgent.label,
        },
      ];

      const configured = snapshot.models.filter(
        (m) => m.modelId === requiredModelId,
      );
      const usable = configured.filter((m) => {
        if (!m.enabled) return false;
        const provider = providerById.get(m.providerId);
        return provider?.enabled ?? false;
      });

      if (configured.length === 0) {
        pushIssue({
          affected,
          requiredModelId,
          kind: "model",
          reason: "not-configured",
        });
        continue;
      }
      if (usable.length === 0) {
        pushIssue({
          affected,
          requiredModelId,
          kind: "model",
          reason: "disabled",
        });
        continue;
      }

      const eligible: Array<{ modelId: string; accountId: string }> = [];
      let keyReason: { reason: string; providerName?: string } | null = null;

      for (const model of usable) {
        const providerName =
          providerById.get(model.providerId)?.name ?? model.providerId;
        const linked = snapshot.accounts.filter((account) =>
          account.providerIds.includes(model.providerId),
        );
        if (linked.length === 0) {
          keyReason ??= { reason: "no-account", providerName };
          continue;
        }
        const active = linked.filter((account) => account.status === "active");
        if (active.length === 0) {
          keyReason ??= { reason: "no-active-account", providerName };
          continue;
        }
        const concurrent = active.filter(
          (account) => account.concurrencyLimit > 0,
        );
        if (concurrent.length === 0) {
          keyReason ??= { reason: "no-concurrency", providerName };
          continue;
        }
        for (const account of concurrent) {
          const activeKeys = (keysByAccount.get(account.id) ?? []).filter(
            (key) => isKeyActive(key, now),
          );
          if (activeKeys.length > 0) {
            eligible.push({ modelId: model.id, accountId: account.id });
          } else {
            keyReason ??= { reason: "no-key", providerName };
          }
        }
      }

      if (eligible.length === 0) {
        pushIssue({
          affected,
          requiredModelId,
          kind: "key",
          reason: keyReason?.reason ?? "no-key",
          providerName: keyReason?.providerName,
        });
        continue;
      }

      const hasActivePricing = eligible.some(({ modelId, accountId }) =>
        snapshot.pricing.some(
          (pricing) =>
            pricing.modelId === modelId &&
            pricing.accountId === accountId &&
            isActivePricing(pricing, now),
        ),
      );
      if (!hasActivePricing) {
        pushIssue({
          affected,
          requiredModelId,
          kind: "pricing",
          reason: "inactive",
        });
      }
    }
  }
  return { issues, checkedAgents };
}

function issueMessage(
  t: (key: string, values?: Record<string, string | number | Date>) => string,
  issue: CheckIssue,
) {
  switch (issue.kind) {
    case "model":
      return issue.reason === "disabled"
        ? t("checkModelDisabled", { modelId: issue.requiredModelId })
        : t("checkModelNotConfigured", { modelId: issue.requiredModelId });
    case "key": {
      const provider = issue.providerName ?? issue.requiredModelId;
      switch (issue.reason) {
        case "no-account":
          return t("checkNoAccount", { provider });
        case "no-active-account":
          return t("checkNoActiveAccount", { provider });
        case "no-concurrency":
          return t("checkNoConcurrency", { provider });
        default:
          return t("checkNoActiveKey", { provider });
      }
    }
    case "pricing":
      return t("checkNoPricing", { modelId: issue.requiredModelId });
  }
}

function KindBadge({
  kind,
  t,
}: {
  kind: IssueKind;
  t: (key: string) => string;
}) {
  if (kind === "pricing") {
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
      >
        {t("checkIssueKind_pricing")}
      </Badge>
    );
  }
  return <Badge variant="destructive">{t(`checkIssueKind_${kind}`)}</Badge>;
}

function KindIcon({ kind }: { kind: IssueKind }) {
  if (kind === "pricing") {
    return <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
  }
  return <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
}

function IssueReport({
  issues,
  checkedAgents,
}: {
  issues: CheckIssue[];
  checkedAgents: number;
}) {
  const t = useTranslations("AiSettings");

  if (checkedAgents === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("checkNoAgents")}</p>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-emerald-500/5 p-4">
        <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-500" />
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          {t("checkSummaryOk", { checked: checkedAgents })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        {t("checkSummary", {
          checked: checkedAgents,
          count: issues.length,
        })}
      </p>
      <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {issues.map((issue) => (
          <div
            key={`${issue.kind}-${issue.reason}-${issue.requiredModelId}-${issue.providerName ?? ""}`}
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            <KindIcon kind={issue.kind} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{issueMessage(t, issue)}</p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
                <ul className="list-disc pl-4">
                  {issue.affected.map((entry) => (
                    <li key={`${entry.agentCode}-${entry.subAgentKey}`}>
                      {entry.agentName} · {entry.subAgentLabel} ·{" "}
                      {issue.requiredModelId}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <KindBadge kind={issue.kind} t={t} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConfigurationCheckButton() {
  const t = useTranslations("AiSettings");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "error" | "done">(
    "idle",
  );
  const [issues, setIssues] = useState<CheckIssue[]>([]);
  const [checkedAgents, setCheckedAgents] = useState(0);

  async function run() {
    setOpen(true);
    setState("loading");
    setIssues([]);
    setCheckedAgents(0);
    try {
      const snapshot = await loadSnapshot();
      const result = buildIssues(snapshot);
      setIssues(result.issues);
      setCheckedAgents(result.checkedAgents);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <Button size="sm" onClick={run}>
        <ShieldCheck />
        {t("check")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("checkTitle")}</DialogTitle>
            <DialogDescription>{t("checkDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {state === "loading" && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("checking")}
              </div>
            )}
            {state === "error" && (
              <p className="text-sm text-destructive">{t("checkError")}</p>
            )}
            {state === "done" && (
              <IssueReport issues={issues} checkedAgents={checkedAgents} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
