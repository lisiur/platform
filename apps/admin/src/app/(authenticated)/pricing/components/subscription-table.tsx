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
  DropdownMenuItem,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { type UseFormReturn, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDate } from "@/utils/date";

const createSchema = z.object({
  principalType: z.literal("user"),
  principalId: z.string().min(1),
  planId: z.string().min(1),
  status: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});
const updateSchema = z.object({
  status: z.string().optional(),
  endsAt: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;
type UpdateFormValues = z.infer<typeof updateSchema>;

interface Sub {
  id: string;
  principalType: string;
  principalId: string;
  planId: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
}

export function SubscriptionTable() {
  const t = useTranslations("Pricing");
  const [search, setSearch] = useState("");
  const [ds, setDs] = useState("");
  const dr = useRef<NodeJS.Timeout | null>(null);
  const [co, setCo] = useState(false);
  const [ei, setEi] = useState<Sub | null>(null);
  const [di, setDi] = useState<Sub | null>(null);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    return () => {
      if (dr.current) clearTimeout(dr.current);
    };
  }, []);
  useEffect(() => {
    appClient.api.pricing.plans
      .$get({ query: { limit: 100 } })
      .then((r) => r.json())
      .then((d) => setPlans(d.plans))
      .catch(() => {});
  }, []);

  const {
    items: subs,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<Sub>({
    queryKey: ["pricing-subs", { search: ds || undefined }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(
        appClient.api.pricing.subscriptions.$get,
      )({ query: { limit, offset, principalId: ds || undefined } });
      const d = await res.json();
      return { items: d.subscriptions, total: d.total };
    },
  });

  function hs(v: string) {
    setSearch(v);
    if (dr.current) clearTimeout(dr.current);
    dr.current = setTimeout(() => {
      setDs(v);
      setPage(1);
    }, 300);
  }

  async function hc() {
    setSaving(true);
    try {
      const b = createForm.getValues();
      await withApiFeedback(appClient.api.pricing.subscriptions.$post)({
        json: {
          ...b,
          startsAt: b.startsAt ? new Date(b.startsAt).toISOString() : undefined,
          endsAt: b.endsAt ? new Date(b.endsAt).toISOString() : null,
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
  function openEdit(s: Sub) {
    updateForm.reset({
      status: s.status,
      endsAt: s.endsAt?.substring(0, 10) ?? "",
    });
    setEi(s);
  }

  async function hu() {
    if (!ei) return;
    setSaving(true);
    try {
      const b = updateForm.getValues();
      const p: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(b)) {
        if (v === undefined || v === "") continue;
        if (k === "endsAt")
          p[k] = v ? new Date(v as string).toISOString() : null;
        else p[k] = v;
      }
      await withApiFeedback(appClient.api.pricing.subscriptions[":id"].$put)({
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
      await withApiFeedback(appClient.api.pricing.subscriptions[":id"].$delete)(
        { param: { id: di.id } },
      );
      setDi(null);
      refresh();
      toast.success(t("deleted"));
    } catch {
    } finally {
      setSaving(false);
    }
  }

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      principalType: "user",
      principalId: "",
      planId: "",
      status: "active",
      startsAt: "",
      endsAt: "",
    },
  });
  const updateForm = useForm<UpdateFormValues>({
    resolver: zodResolver(updateSchema),
  });

  const pn = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const planSelect = (form: UseFormReturn<CreateFormValues>) => {
    const value = String(form.watch("planId") ?? "");
    return (
      <Select
        value={value}
        onValueChange={(v) => form.setValue("planId", v ?? "")}
      >
        <SelectTrigger>
          <SelectValue>{value ? pn(value) : ""}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {plans.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
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
        empty={subs.length === 0}
        emptyMessage={t("noSubscriptions")}
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
            <TableHead>{t("principalType")}</TableHead>
            <TableHead>{t("principalId")}</TableHead>
            <TableHead>{t("plan")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("startsAt")}</TableHead>
            <TableHead>{t("endsAt")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {subs.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{s.principalType}</TableCell>
              <TableCell className="font-mono text-xs">
                {s.principalId}
              </TableCell>
              <TableCell>{pn(s.planId)}</TableCell>
              <TableCell>{s.status}</TableCell>
              <TableCell>{formatDate(s.startsAt)}</TableCell>
              <TableCell>{s.endsAt ? formatDate(s.endsAt) : "-"}</TableCell>
              <TableCell>{formatDate(s.createdAt)}</TableCell>
              <TableActionCell
                menuLabel={t("actions")}
                menu={
                  <>
                    <DropdownMenuItem onClick={() => openEdit(s)}>
                      <Pencil />
                      {t("edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDi(s)}
                    >
                      <Trash2 />
                      {t("delete")}
                    </DropdownMenuItem>
                  </>
                }
              >
                <ButtonGroup className="ml-auto">
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("edit")}
                    tooltip={t("edit")}
                    onClick={() => openEdit(s)}
                  >
                    <Pencil />
                  </TooltipButton>
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    tooltip={t("delete")}
                    onClick={() => setDi(s)}
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
            <DialogTitle>{t("createSubscription")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="cs-form" onSubmit={createForm.handleSubmit(hc)}>
              <FieldGroup>
                <Field>
                  <FieldLabel>{t("principalType")}</FieldLabel>
                  <Select
                    value={createForm.watch("principalType")}
                    onValueChange={(v) =>
                      createForm.setValue("principalType", v as "user")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">user</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="cs-pid" required>
                    {t("principalId")}
                  </FieldLabel>
                  <Input
                    id="cs-pid"
                    aria-invalid={!!createForm.formState.errors.principalId}
                    {...createForm.register("principalId")}
                  />
                  <FieldError
                    errors={
                      createForm.formState.errors.principalId
                        ? [createForm.formState.errors.principalId]
                        : undefined
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel required>{t("plan")}</FieldLabel>
                  {planSelect(createForm)}
                  <FieldError
                    errors={
                      createForm.formState.errors.planId
                        ? [createForm.formState.errors.planId]
                        : undefined
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="cs-st">{t("status")}</FieldLabel>
                  <Input id="cs-st" {...createForm.register("status")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="cs-sa">{t("startsAt")}</FieldLabel>
                  <Input
                    id="cs-sa"
                    type="date"
                    {...createForm.register("startsAt")}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="cs-ea">{t("endsAt")}</FieldLabel>
                  <Input
                    id="cs-ea"
                    type="date"
                    {...createForm.register("endsAt")}
                  />
                </Field>
              </FieldGroup>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCo(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="cs-form" disabled={saving}>
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
            <DialogTitle>{t("editSubscription")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {ei && (
              <form id="es-form" onSubmit={updateForm.handleSubmit(hu)}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="es-st">{t("status")}</FieldLabel>
                    <Input id="es-st" {...updateForm.register("status")} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="es-ea">{t("endsAt")}</FieldLabel>
                    <Input
                      id="es-ea"
                      type="date"
                      {...updateForm.register("endsAt")}
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
            <Button type="submit" form="es-form" disabled={saving}>
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
            <DialogTitle>{t("deleteSubscription")}</DialogTitle>
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
