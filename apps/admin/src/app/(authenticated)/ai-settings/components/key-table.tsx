"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PaginatedTableFrame } from "@repo/frontend";
import {
  Button,
  ButtonGroup,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipButton,
} from "@repo/ui";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";

const createSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  secret: z.string().min(1),
  status: z.string().optional(),
  expiresAt: z.string().optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  secret: z.string().min(1).optional(),
  status: z.string().optional(),
  expiresAt: z.string().optional(),
});

interface AiKey {
  id: string;
  accountId: string;
  name: string;
  mask: string | null;
  status: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function KeyTable({
  account,
}: {
  account?: { id: string; name: string };
}) {
  const t = useTranslations("AiSettings");
  const [search, setSearch] = useState("");
  const [ds, setDs] = useState("");
  const dr = useRef<NodeJS.Timeout | null>(null);
  const [co, setCo] = useState(false);
  const [ei, setEi] = useState<AiKey | null>(null);
  const [di, setDi] = useState<AiKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>(
    [],
  );

  useEffect(() => {
    return () => {
      if (dr.current) clearTimeout(dr.current);
    };
  }, []);
  useEffect(() => {
    if (account) {
      setAccounts([account]);
      return;
    }
    appClient.api.ai.accounts
      .$get({ query: { limit: 100 } })
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts))
      .catch(() => {});
  }, [account]);

  const {
    items: keys,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<AiKey>({
    queryKey: ["ai-keys", { accountId: account?.id, search: ds || undefined }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.ai.keys.$get)({
        query: {
          limit,
          offset,
          accountId: account?.id,
          search: ds || undefined,
        },
      });
      const d = await res.json();
      return { items: d.keys, total: d.total };
    },
  });

  function hs(value: string) {
    setSearch(value);
    if (dr.current) clearTimeout(dr.current);
    dr.current = setTimeout(() => {
      setDs(value);
      setPage(1);
    }, 300);
  }

  async function hc() {
    setSaving(true);
    try {
      const body = createForm.getValues();
      await withApiFeedback(appClient.api.ai.keys.$post)({
        json: {
          ...body,
          expiresAt: body.expiresAt
            ? new Date(body.expiresAt).toISOString()
            : null,
        },
      });
      setCo(false);
      createForm.reset();
      refresh();
      toast.success(t("created"));
    } catch {
    } finally {
      setSaving(false);
    }
  }
  async function hu() {
    if (!ei) return;
    setSaving(true);
    try {
      const b = updateForm.getValues();
      const p: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b)) {
        if (v === undefined || v === "") continue;
        p[k] = k === "expiresAt" ? new Date(v as string).toISOString() : v;
      }
      await withApiFeedback(appClient.api.ai.keys[":id"].$put)({
        param: { id: ei.id },
        json: p,
      });
      setEi(null);
      updateForm.reset();
      refresh();
      toast.success(t("updated"));
    } catch {
    } finally {
      setSaving(false);
    }
  }
  async function hd() {
    if (!di) return;
    setSaving(true);
    try {
      await withApiFeedback(appClient.api.ai.keys[":id"].$delete)({
        param: { id: di.id },
      });
      setDi(null);
      refresh();
      toast.success(t("deleted"));
    } catch {
    } finally {
      setSaving(false);
    }
  }

  const createForm = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: {
      accountId: account?.id ?? "",
      name: "",
      secret: "",
      status: "active",
      expiresAt: "",
    },
  });
  const updateForm = useForm({ resolver: zodResolver(updateSchema) });

  const an = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const acctSelect = (form: typeof createForm) => {
    const value = form.watch("accountId") ?? "";
    return (
      <Select
        value={value}
        onValueChange={(v) => {
          if (v != null) form.setValue("accountId", v);
        }}
      >
        <SelectTrigger>
          <SelectValue>{value ? an(value) : ""}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={keys.length === 0}
        emptyMessage={t("noKeys")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        toolbar={
          <div className="flex items-center gap-3 w-full">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("search")}
                value={search}
                onChange={(e) => hs(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              size="sm"
              className="ml-auto shrink-0"
              onClick={() => setCo(true)}
            >
              <Plus />
              {t("add")}
            </Button>
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("name")}</TableHead>
            {!account && <TableHead>{t("account")}</TableHead>}
            <TableHead>{t("mask")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((k) => (
            <TableRow key={k.id}>
              <TableCell>{k.name}</TableCell>
              {!account && <TableCell>{an(k.accountId)}</TableCell>}
              <TableCell className="font-mono text-xs">{k.mask}</TableCell>
              <TableCell>{k.status}</TableCell>
              <TableCell>{formatDate(k.createdAt)}</TableCell>
              <TableActionCell menuLabel={t("actions")}>
                <ButtonGroup className="ml-auto">
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("edit")}
                    tooltip={t("edit")}
                    onClick={() => {
                      updateForm.reset({
                        name: k.name,
                        status: k.status,
                        expiresAt: k.expiresAt ?? "",
                      });
                      setEi(k);
                    }}
                  >
                    <Pencil />
                  </TooltipButton>
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    tooltip={t("delete")}
                    onClick={() => setDi(k)}
                  >
                    <Trash2 />
                  </TooltipButton>
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      <Dialog open={co} onOpenChange={setCo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createKey")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="ck-form" onSubmit={createForm.handleSubmit(hc)}>
              <FieldGroup>
                {!account && (
                  <Field>
                    <FieldLabel>{t("account")}</FieldLabel>
                    {acctSelect(createForm)}
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="ck-name">{t("name")}</FieldLabel>
                  <Input
                    id="ck-name"
                    autoComplete="off"
                    {...createForm.register("name")}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ck-secret">{t("secret")}</FieldLabel>
                  <Input
                    id="ck-secret"
                    autoComplete="off"
                    {...createForm.register("secret")}
                  />
                </Field>
                <Field>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={createForm.watch("status") !== "inactive"}
                      onCheckedChange={(checked) =>
                        createForm.setValue(
                          "status",
                          checked ? "active" : "inactive",
                        )
                      }
                      id="ck-status"
                    />
                    <FieldLabel htmlFor="ck-status">{t("enabled")}</FieldLabel>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ck-expires">{t("expiresAt")}</FieldLabel>
                  <Input
                    id="ck-expires"
                    type="date"
                    {...createForm.register("expiresAt")}
                  />
                </Field>
              </FieldGroup>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCo(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="ck-form" disabled={saving}>
              {saving ? t("saving") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!ei}
        onOpenChange={(o) => {
          if (!o) setEi(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editKey")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {ei && (
              <form id="ek-form" onSubmit={updateForm.handleSubmit(hu)}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="ek-name">{t("name")}</FieldLabel>
                    <Input
                      id="ek-name"
                      autoComplete="off"
                      {...updateForm.register("name")}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ek-secret">{t("rotate")}</FieldLabel>
                    <Input
                      id="ek-secret"
                      autoComplete="off"
                      {...updateForm.register("secret")}
                    />
                  </Field>
                  <Field>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={updateForm.watch("status") !== "inactive"}
                        onCheckedChange={(checked) =>
                          updateForm.setValue(
                            "status",
                            checked ? "active" : "inactive",
                          )
                        }
                        id="ek-status"
                      />
                      <FieldLabel htmlFor="ek-status">
                        {t("enabled")}
                      </FieldLabel>
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ek-expires">
                      {t("expiresAt")}
                    </FieldLabel>
                    <Input
                      id="ek-expires"
                      type="date"
                      {...updateForm.register("expiresAt")}
                    />
                  </Field>
                </FieldGroup>
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEi(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="ek-form" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!di}
        onOpenChange={(o) => {
          if (!o) setDi(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteKey")}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDi(null)}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={hd} disabled={saving}>
              {saving ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
