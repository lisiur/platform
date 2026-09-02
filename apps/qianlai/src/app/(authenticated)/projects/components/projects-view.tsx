"use client";

import { roleAtLeast } from "@repo/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipButton,
} from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CalendarRange,
  FolderKanban,
  Pencil,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { type InviteCodeRow, LiveInvite } from "@/components/live-invite";
import { useConfirm } from "@/hooks/use-confirm";
import { useLedgers } from "@/hooks/use-ledgers";
import {
  type QianlaiProject,
  useProjectReport,
  useProjects,
} from "@/hooks/use-projects";
import { appClient, useSession, withApiFeedback } from "@/lib/api";
import { formatAmount } from "@/utils/amount";
import { ProjectDialog } from "./project-dialog";

interface MemberRow {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string | null } | null;
}

export function ProjectsView() {
  const t = useTranslations("Projects");
  const jt = useTranslations("Journal");
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { activeLedger, isLoading: ledgersLoading } = useLedgers();
  const ledgerId = activeLedger?.id;
  const { projects, isLoading } = useProjects(ledgerId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QianlaiProject | undefined>();
  const [inviteOpen, setInviteOpen] = useState(false);

  const selected =
    projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
    }
  }, [selected, selectedId]);

  const canManage =
    !!activeLedger &&
    activeLedger.status === "active" &&
    roleAtLeast(activeLedger.myRole, "editor");

  const { report, isLoading: reportLoading } = useProjectReport(
    ledgerId,
    selected?.id,
  );

  const { data: membersData } = useQuery({
    queryKey: ["qianlai", "members", ledgerId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].members.$get,
      )({ param: { ledgerId: ledgerId ?? "" } });
      return (await res.json()) as { members: MemberRow[] };
    },
    enabled: !!ledgerId && canManage && !!selected,
  });

  function invalidateProjects() {
    queryClient.invalidateQueries({
      queryKey: ["qianlai", "projects", ledgerId],
    });
    queryClient.invalidateQueries({
      queryKey: ["qianlai", "project-report", ledgerId],
    });
  }

  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].projects[":projectId"]
          .members.$post,
      )({
        param: { ledgerId: ledgerId ?? "", projectId: selected?.id ?? "" },
        json: { userId },
      });
    },
    onSuccess: () => {
      invalidateProjects();
      toast.success(t("memberAdded"));
    },
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].projects[":projectId"]
          .members[":userId"].$delete,
      )({
        param: {
          ledgerId: ledgerId ?? "",
          projectId: selected?.id ?? "",
          userId,
        },
      });
    },
    onSuccess: () => {
      invalidateProjects();
      toast.success(t("memberRemoved"));
    },
  });

  const leaveProject = useMutation({
    mutationFn: async () => {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].projects[":projectId"]
          .leave.$post,
      )({ param: { ledgerId: ledgerId ?? "", projectId: selected?.id ?? "" } });
    },
    onSuccess: () => {
      invalidateProjects();
      setSelectedId(null);
      toast.success(t("leftProject"));
    },
  });

  const archiveToggle = useMutation({
    mutationFn: async (project: QianlaiProject) => {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].projects[":projectId"]
          .$patch,
      )({
        param: { ledgerId: ledgerId ?? "", projectId: project.id },
        json: { status: project.status === "active" ? "archived" : "active" },
      });
    },
    onSuccess: () => {
      invalidateProjects();
      toast.success(t("updateSuccess"));
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (project: QianlaiProject) => {
      await withApiFeedback(
        appClient.api.bookkeeping.ledgers[":ledgerId"].projects[":projectId"]
          .$delete,
      )({ param: { ledgerId: ledgerId ?? "", projectId: project.id } });
    },
    onSuccess: () => {
      invalidateProjects();
      setSelectedId(null);
      toast.success(t("deleteSuccess"));
    },
  });

  async function confirmRemoveMember(userId: string) {
    const ok = await confirm({
      title: t("removeMember"),
      description: t("confirmRemoveMember"),
      confirmLabel: t("removeMember"),
      cancelLabel: t("cancel"),
    });
    if (ok) removeMember.mutate(userId);
  }

  async function confirmLeave() {
    const ok = await confirm({
      title: t("leave"),
      description: t("confirmLeave"),
      confirmLabel: t("leave"),
      cancelLabel: t("cancel"),
    });
    if (ok) leaveProject.mutate();
  }

  async function confirmDeleteProject(project: QianlaiProject) {
    const ok = await confirm({
      title: t("delete"),
      description: t("confirmDelete", { name: project.name }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (ok) deleteProject.mutate(project);
  }

  const myUserId = session?.user.id;
  const isProjectMember =
    !!selected && selected.members.some((m) => m.userId === myUserId);
  const addableMembers = (membersData?.members ?? []).filter(
    (m) => !selected?.members.some((pm) => pm.userId === m.userId),
  );

  if (ledgersLoading || isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Project list */}
      <div className="flex w-full shrink-0 flex-col gap-2 lg:w-72">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">{t("allProjects")}</h2>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <FolderKanban className="h-4 w-4" />
              {t("create")}
            </Button>
          )}
        </div>
        {projects.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {t("empty")}
          </p>
        )}
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => setSelectedId(project.id)}
            className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
              selected?.id === project.id ? "border-primary bg-muted/50" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{project.name}</span>
              {project.status === "archived" && (
                <Badge variant="outline">{t("archived")}</Badge>
              )}
            </div>
            <div className="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {project.members.length}
              </span>
              <span>{jt("entryCount", { count: project.entryCount })}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Project detail */}
      {selected && (
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate font-semibold text-lg">
              {selected.name}
            </h2>
            {canManage && (
              <>
                <TooltipButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("edit")}
                  tooltip={t("edit")}
                  onClick={() => {
                    setEditing(selected);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil />
                </TooltipButton>
                <TooltipButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    selected.status === "active" ? t("archive") : t("unarchive")
                  }
                  tooltip={
                    selected.status === "active" ? t("archive") : t("unarchive")
                  }
                  onClick={() => archiveToggle.mutate(selected)}
                >
                  {selected.status === "active" ? (
                    <Archive />
                  ) : (
                    <ArchiveRestore />
                  )}
                </TooltipButton>
                {activeLedger?.myRole === "owner" && (
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    tooltip={t("delete")}
                    onClick={() => confirmDeleteProject(selected)}
                  >
                    <Trash2 />
                  </TooltipButton>
                )}
              </>
            )}
            {isProjectMember && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => confirmLeave()}
              >
                {t("leave")}
              </Button>
            )}
            {canManage && selected.status === "active" && (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-4 w-4" />
                {t("invite")}
              </Button>
            )}
          </div>

          {(selected.startDate || selected.endDate) && (
            <p className="text-muted-foreground flex items-center gap-1 text-sm">
              <CalendarRange className="h-4 w-4" />
              {selected.startDate
                ? new Date(selected.startDate).toLocaleDateString()
                : "…"}
              {" – "}
              {selected.endDate
                ? new Date(selected.endDate).toLocaleDateString()
                : "…"}
            </p>
          )}

          {reportLoading || !report ? (
            <div className="flex min-h-[120px] items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <>
              {/* Income / expense statement */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {t("totalExpense")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-2xl font-semibold tabular-nums">
                      {formatAmount(report.statement.totalExpense)}
                    </p>
                    <div className="mt-2 space-y-1">
                      {report.statement.expense.map((row) => (
                        <div
                          key={row.id}
                          className="text-muted-foreground flex justify-between text-sm"
                        >
                          <span>{row.name ?? row.code}</span>
                          <span className="font-mono tabular-nums">
                            {formatAmount(row.balance)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {t("totalIncome")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-2xl font-semibold tabular-nums">
                      {formatAmount(report.statement.totalIncome)}
                    </p>
                    <div className="mt-2 space-y-1">
                      {report.statement.income.map((row) => (
                        <div
                          key={row.id}
                          className="text-muted-foreground flex justify-between text-sm"
                        >
                          <span>{row.name ?? row.code}</span>
                          <span className="font-mono tabular-nums">
                            {formatAmount(row.balance)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Settlement */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t("settlement")}</CardTitle>
                  <p className="text-muted-foreground text-xs">
                    {t("settlementHint")}
                  </p>
                </CardHeader>
                <CardContent>
                  <Table containerClassName="overflow-auto rounded-md border">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("member")}</TableHead>
                        <TableHead className="text-right">
                          {t("paid")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("share")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("balance")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.settlement.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell className="font-medium">
                            {row.name}
                            {row.userId === myUserId && (
                              <span className="text-muted-foreground ml-1 text-xs">
                                ({t("you")})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-right tabular-nums">
                            {formatAmount(row.paid)}
                          </TableCell>
                          <TableCell className="font-mono text-right tabular-nums">
                            {formatAmount(row.share)}
                          </TableCell>
                          <TableCell className="font-mono text-right tabular-nums">
                            <span
                              className={
                                row.balance > 0
                                  ? "text-emerald-600"
                                  : row.balance < 0
                                    ? "text-red-600"
                                    : undefined
                              }
                            >
                              {formatAmount(row.balance)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}

          {/* Members */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("members")}</CardTitle>
              {canManage && selected.status === "active" && (
                <div className="flex items-center gap-2">
                  <Select
                    value={null}
                    onValueChange={(v) => {
                      if (v) addMember.mutate(v);
                    }}
                    items={addableMembers.map((m) => ({
                      value: m.userId,
                      label: m.user?.name ?? m.userId,
                    }))}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={t("addMember")} />
                    </SelectTrigger>
                    <SelectContent>
                      {addableMembers.length === 0 ? (
                        <div className="text-muted-foreground p-2 text-sm">
                          {t("noAddableMembers")}
                        </div>
                      ) : (
                        addableMembers.map((m) => (
                          <SelectItem key={m.userId} value={m.userId}>
                            {m.user?.name ?? m.userId}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {selected.members.map((member) => (
                  <Badge
                    key={member.id}
                    variant="secondary"
                    className="gap-1 py-1 pr-1 pl-2"
                  >
                    {member.user?.name ?? member.userId}
                    {member.userId === myUserId && (
                      <span className="text-muted-foreground">
                        ({t("you")})
                      </span>
                    )}
                    {canManage && selected.status === "active" && (
                      <TooltipButton
                        variant="ghost"
                        size="icon-sm"
                        className="h-4 w-4"
                        aria-label={t("removeMember")}
                        tooltip={t("removeMember")}
                        onClick={() => confirmRemoveMember(member.userId)}
                      >
                        <Trash2 />
                      </TooltipButton>
                    )}
                  </Badge>
                ))}
                {selected.members.length === 0 && (
                  <p className="text-muted-foreground text-sm">{t("empty")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ledgerId={ledgerId ?? ""}
        project={editing}
      />
      {selected && (
        <ProjectInviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          ledgerId={ledgerId ?? ""}
          project={selected}
        />
      )}
    </div>
  );
}

/** Invite dialog: mints live guest invites scoped to one project. */
function ProjectInviteDialog({
  open,
  onOpenChange,
  ledgerId,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerId: string;
  project: QianlaiProject;
}) {
  const t = useTranslations("Projects");

  const mintInvite = useCallback(async () => {
    const res = await withApiFeedback(
      appClient.api.bookkeeping.ledgers[":ledgerId"]["share-codes"].$post,
      // The LiveInvite panel renders the error inline; a background
      // re-mint failing shouldn't toast.
      { showError: false },
    )({
      param: { ledgerId },
      json: { role: "guest" as const, projectId: project.id },
    });
    return (await res.json()) as InviteCodeRow;
  }, [ledgerId, project.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("invite")}</DialogTitle>
          <DialogDescription>{t("inviteDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <LiveInvite mint={mintInvite} />
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
