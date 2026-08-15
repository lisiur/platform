"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PaginatedTableFrame } from "@repo/frontend";
import {
  Badge,
  Button,
  ButtonGroup,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenuItem,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipButton,
} from "@repo/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useConfirm } from "@/hooks/use-confirm";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { useHasPermission } from "@/lib/api/use-has-permission";
import { withApiFeedback } from "@/lib/api/utils";

interface RedeemCodeRow {
  id: string;
  code: string;
  credit: number;
  status: string;
  expiresAt: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type CreateRedeemCodePayload = {
  credit: number;
  expiresAt?: string;
};

type UpdateRedeemCodePayload = {
  credit?: number;
  enabled?: boolean;
  expiresAt?: string | null;
};

const createSchema = z.object({
  credit: z.coerce.number().int().min(1),
  expiresAt: z.string().optional().or(z.literal("")),
});

const updateSchema = z.object({
  credit: z.coerce.number().int().min(1).optional(),
  enabled: z.boolean().optional(),
  expiresAt: z.string().nullable().optional().or(z.literal("")),
});

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function RedeemCodeTable() {
  const t = useTranslations("RedeemCodes");
  const confirm = useConfirm();
  const canCreate = useHasPermission("system/redeem-code:create");
  const canUpdate = useHasPermission("system/redeem-code:update");
  const canDelete = useHasPermission("system/redeem-code:delete");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<RedeemCodeRow | null>(null);
  const [saving, setSaving] = useState(false);

  const {
    items: codes,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<RedeemCodeRow>({
    queryKey: ["redeem-codes"],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api["redeem-codes"].$get)({
        query: { limit, offset },
      });
      const data = await res.json();
      return { items: data.codes, total: data.total };
    },
  });

  const createForm = useForm({ resolver: zodResolver(createSchema) });
  const updateForm = useForm({ resolver: zodResolver(updateSchema) });

  async function handleCreate() {
    setSaving(true);
    try {
      const v = createForm.getValues();
      const payload: CreateRedeemCodePayload = { credit: Number(v.credit) };
      if (v.expiresAt && v.expiresAt !== "") {
        payload.expiresAt = localInputToIso(v.expiresAt);
      }
      await withApiFeedback(appClient.api["redeem-codes"].$post)({
        json: payload,
      });
      setShowCreate(false);
      createForm.reset();
      refresh();
      toast.success(t("created"));
    } catch {
    } finally {
      setSaving(false);
    }
  }

  function openEdit(item: RedeemCodeRow) {
    updateForm.reset({
      credit: item.credit,
      enabled: item.enabled,
      expiresAt: isoToLocalInput(item.expiresAt),
    });
    setEditItem(item);
  }

  async function handleUpdate() {
    if (!editItem) return;
    setSaving(true);
    try {
      const v = updateForm.getValues();
      const p: UpdateRedeemCodePayload = {};
      if (v.credit !== undefined) p.credit = Number(v.credit);
      if (v.enabled !== undefined) p.enabled = v.enabled;
      if (v.expiresAt !== undefined) {
        p.expiresAt =
          v.expiresAt === null || v.expiresAt === ""
            ? null
            : localInputToIso(v.expiresAt);
      }
      await withApiFeedback(appClient.api["redeem-codes"][":id"].$put)({
        param: { id: editItem.id },
        json: p,
      });
      setEditItem(null);
      updateForm.reset();
      refresh();
      toast.success(t("updated"));
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: RedeemCodeRow) {
    const confirmed = await confirm({
      title: t("deleteCode"),
      description: t("deleteConfirmation", { code: item.code }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;
    try {
      await withApiFeedback(appClient.api["redeem-codes"][":id"].$delete)({
        param: { id: item.id },
      });
      refresh();
      toast.success(t("deleted"));
    } catch {}
  }

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={codes.length === 0}
        emptyMessage={t("noCodes")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex w-full justify-end">
            {canCreate && (
              <Button
                onClick={() => {
                  createForm.reset();
                  setShowCreate(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {t("add")}
              </Button>
            )}
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("code")}</TableHead>
            <TableHead>{t("credit")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("expiresAt")}</TableHead>
            <TableHead>{t("enabled")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {codes.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono">{c.code}</TableCell>
              <TableCell>{c.credit}</TableCell>
              <TableCell>
                <Badge variant={c.status === "used" ? "secondary" : "default"}>
                  {c.status}
                </Badge>
              </TableCell>
              <TableCell>
                {c.expiresAt
                  ? new Date(c.expiresAt).toLocaleDateString()
                  : t("never")}
              </TableCell>
              <TableCell>
                <Badge variant={c.enabled ? "default" : "secondary"}>
                  {c.enabled ? t("yes") : t("no")}
                </Badge>
              </TableCell>
              <TableActionCell
                menuLabel={t("actions")}
                menu={
                  canUpdate || canDelete ? (
                    <>
                      {canUpdate && (
                        <DropdownMenuItem onClick={() => openEdit(c)}>
                          <Pencil />
                          {t("edit")}
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDelete(c)}
                        >
                          <Trash2 />
                          {t("delete")}
                        </DropdownMenuItem>
                      )}
                    </>
                  ) : undefined
                }
              >
                <ButtonGroup className="ml-auto">
                  {canUpdate && (
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("edit")}
                      tooltip={t("edit")}
                      onClick={() => openEdit(c)}
                    >
                      <Pencil />
                    </TooltipButton>
                  )}
                  {canDelete && (
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("delete")}
                      tooltip={t("delete")}
                      onClick={() => handleDelete(c)}
                    >
                      <Trash2 />
                    </TooltipButton>
                  )}
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      <Dialog
        open={showCreate}
        onOpenChange={(o) => {
          if (!o) setShowCreate(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createCode")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form
              id="rc-create"
              onSubmit={createForm.handleSubmit(handleCreate)}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="rc-credit">{t("credit")}</FieldLabel>
                  <Input
                    id="rc-credit"
                    type="number"
                    {...(createForm.register("credit") as object)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rc-exp">{t("expiresAt")}</FieldLabel>
                  <Input
                    id="rc-exp"
                    type="datetime-local"
                    {...(createForm.register("expiresAt") as object)}
                  />
                </Field>
              </FieldGroup>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="rc-create" disabled={saving}>
              {saving ? t("saving") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editItem}
        onOpenChange={(o) => {
          if (!o) setEditItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("editCode")} — {editItem?.code}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            {editItem && (
              <form
                id="rc-edit"
                onSubmit={updateForm.handleSubmit(handleUpdate)}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="rc-edit-credit">
                      {t("credit")}
                    </FieldLabel>
                    <Input
                      id="rc-edit-credit"
                      type="number"
                      {...(updateForm.register("credit") as object)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="rc-edit-exp">
                      {t("expiresAt")}
                    </FieldLabel>
                    <Input
                      id="rc-edit-exp"
                      type="datetime-local"
                      {...(updateForm.register("expiresAt") as object)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="rc-edit-enabled">
                      {t("enabled")}
                    </FieldLabel>
                    <input
                      id="rc-edit-enabled"
                      type="checkbox"
                      {...(updateForm.register("enabled") as object)}
                    />
                  </Field>
                </FieldGroup>
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="rc-edit" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
