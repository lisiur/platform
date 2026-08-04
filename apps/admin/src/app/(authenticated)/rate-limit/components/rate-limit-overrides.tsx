"use client";

import {
  Badge,
  Button,
  ButtonGroup,
  DropdownMenuItem,
  Skeleton,
  Table,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import { formatDuration } from "@/utils/format";
import { OverrideDialog, type OverrideRow } from "./override-dialog";

type OverrideStatus = "active" | "scheduled" | "expired";

function computeStatus(o: OverrideRow): OverrideStatus {
  const now = Date.now();
  if (o.startAt && now < new Date(o.startAt).getTime()) return "scheduled";
  if (o.endAt && now >= new Date(o.endAt).getTime()) return "expired";
  return "active";
}

export function RateLimitOverrides() {
  const t = useTranslations("RateLimit");
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<OverrideRow | null>(null);

  const { data: overrides, isLoading } = useQuery({
    queryKey: ["rate-limit-overrides"],
    queryFn: async () => {
      const res = await appClient.api["rate-limit"].overrides.$get();
      return (await res.json()) as OverrideRow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (subject: string) => {
      await withApiFeedback(
        appClient.api["rate-limit"].overrides[":subject"].$delete,
      )({ param: { subject } });
    },
    onSuccess: () => {
      toast.success(t("overrides.deleteSuccess"));
      void queryClient.invalidateQueries({
        queryKey: ["rate-limit-overrides"],
      });
    },
  });

  async function handleDelete(o: OverrideRow) {
    const confirmed = await confirm({
      title: t("overrides.delete"),
      description: t("overrides.confirmDelete"),
      confirmLabel: t("overrides.delete"),
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(o.subject);
    } catch {
      // Error handled by API feedback.
    }
  }

  function handleSuccess(msg: string) {
    void queryClient.invalidateQueries({ queryKey: ["rate-limit-overrides"] });
    toast.success(msg);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t("overrides.add")}
        </Button>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border">
        <Table>
          <TableHeader sticky>
            <TableRow>
              <TableHead>{t("overrides.subject")}</TableHead>
              <TableHead>{t("overrides.type")}</TableHead>
              <TableHead>{t("overrides.policy")}</TableHead>
              <TableHead>{t("overrides.timeRange")}</TableHead>
              <TableHead>{t("overrides.statusLabel")}</TableHead>
              <TableHead>{t("overrides.note")}</TableHead>
              <TableActionHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ) : overrides && overrides.length > 0 ? (
              overrides.map((o) => {
                const status = computeStatus(o);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-sm">
                      {o.subject}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {o.type === "ip"
                          ? t("dialog.typeIp")
                          : t("dialog.typeUser")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {o.bypass ? (
                        <Badge variant="secondary">
                          {t("overrides.whitelist")}
                        </Badge>
                      ) : (
                        <span className="text-sm">
                          {o.max != null ? `${o.max}` : "∞"} /{" "}
                          {o.windowMs != null
                            ? formatDuration(o.windowMs)
                            : t("overrides.always")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {!o.startAt && !o.endAt
                        ? t("overrides.always")
                        : [
                            o.startAt ? formatDateTime(o.startAt) : "…",
                            o.endAt ? formatDateTime(o.endAt) : "…",
                          ].join(" → ")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          status === "active"
                            ? "default"
                            : status === "scheduled"
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {t(`overrides.${status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-48 truncate text-sm">
                      {o.note || "—"}
                    </TableCell>
                    <TableActionCell
                      menuLabel={t("overrides.edit")}
                      menu={
                        <>
                          <DropdownMenuItem onClick={() => setEditing(o)}>
                            <Pencil />
                            {t("overrides.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => handleDelete(o)}
                          >
                            <Trash2 />
                            {t("overrides.delete")}
                          </DropdownMenuItem>
                        </>
                      }
                    >
                      <ButtonGroup className="ml-auto">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("overrides.edit")}
                                onClick={() => setEditing(o)}
                              >
                                <Pencil />
                              </Button>
                            }
                          />
                          <TooltipContent>{t("overrides.edit")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("overrides.delete")}
                                disabled={deleteMutation.isPending}
                                onClick={() => handleDelete(o)}
                              >
                                <Trash2 />
                              </Button>
                            }
                          />
                          <TooltipContent>
                            {t("overrides.delete")}
                          </TooltipContent>
                        </Tooltip>
                      </ButtonGroup>
                    </TableActionCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-8 text-center"
                >
                  {t("overrides.noOverrides")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showCreate && (
        <OverrideDialog
          open={showCreate}
          onOpenChange={(open) => !open && setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            handleSuccess(t("overrides.createSuccess"));
          }}
        />
      )}

      {editing && (
        <OverrideDialog
          override={editing}
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            handleSuccess(t("overrides.updateSuccess"));
          }}
        />
      )}
    </div>
  );
}
