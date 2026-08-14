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
  MultiSelect,
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

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  price: z.coerce.number().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  features: z.array(z.object({ featureId: z.string() })).optional(),
});
const updateSchema = createSchema.omit({ code: true });

type PlanFormValues = {
  code?: string;
  name?: string;
  price?: number;
  currency?: string;
  status?: string;
  features?: { featureId: string }[];
};

interface PlanFeature {
  featureId: string;
  code: string;
  name: string;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  features: PlanFeature[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function PlanTable() {
  const t = useTranslations("Pricing");
  const [search, setSearch] = useState("");
  const [ds, setDs] = useState("");
  const dr = useRef<NodeJS.Timeout | null>(null);
  const [co, setCo] = useState(false);
  const [ei, setEi] = useState<Plan | null>(null);
  const [di, setDi] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [allFeatures, setAllFeatures] = useState<
    { value: string; label: string }[]
  >([]);

  useEffect(() => {
    return () => {
      if (dr.current) clearTimeout(dr.current);
    };
  }, []);

  const {
    items: plans,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<Plan>({
    queryKey: ["pricing-plans", { search: ds || undefined }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.pricing.plans.$get)({
        query: { limit, offset, search: ds || undefined },
      });
      const d = await res.json();
      return { items: d.plans, total: d.total };
    },
  });

  async function loadFeatures() {
    const res = await withApiFeedback(appClient.api.pricing.features.$get)({
      query: {},
    });
    const d = await res.json();
    setAllFeatures(
      d.features.map((f: { id: string; code: string; name: string }) => ({
        value: f.id,
        label: `${f.name} (${f.code})`,
      })),
    );
  }

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
      await withApiFeedback(appClient.api.pricing.plans.$post)({
        json: createSchema.parse(createForm.getValues()),
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
        p[k] = v;
      }
      await withApiFeedback(appClient.api.pricing.plans[":id"].$put)({
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
      await withApiFeedback(appClient.api.pricing.plans[":id"].$delete)({
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
      code: "",
      name: "",
      price: 0,
      currency: "USD",
      status: "active",
    },
  });
  const updateForm = useForm({ resolver: zodResolver(updateSchema) });

  const pf = (prefix: string, isCreate: boolean) => {
    const form = (
      isCreate ? createForm : updateForm
    ) as UseFormReturn<PlanFormValues>;
    return (
      <FieldGroup>
        {isCreate && (
          <Field>
            <FieldLabel htmlFor={`${prefix}-code`}>{t("code")}</FieldLabel>
            <Input
              id={`${prefix}-code`}
              {...(form.register("code") as object)}
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor={`${prefix}-name`}>{t("name")}</FieldLabel>
          <Input id={`${prefix}-name`} {...(form.register("name") as object)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-curr`}>{t("currency")}</FieldLabel>
          <Input
            id={`${prefix}-curr`}
            {...(form.register("currency") as object)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-st`}>{t("status")}</FieldLabel>
          <Input id={`${prefix}-st`} {...(form.register("status") as object)} />
        </Field>
        <Field>
          <FieldLabel>{t("features")}</FieldLabel>
          <MultiSelect
            options={allFeatures}
            value={form.watch("features")?.map((f) => f.featureId) ?? []}
            onChange={(ids) =>
              form.setValue(
                "features",
                ids.map((id) => ({ featureId: id })),
                { shouldDirty: true, shouldValidate: true },
              )
            }
            placeholder={t("features")}
          />
        </Field>
      </FieldGroup>
    );
  };

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={plans.length === 0}
        emptyMessage={t("noPlans")}
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
              onClick={() => {
                loadFeatures();
                setCo(true);
              }}
            >
              <Plus />
              {t("add")}
            </Button>
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("code")}</TableHead>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("price")}</TableHead>
            <TableHead>{t("features")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-xs">{p.code}</TableCell>
              <TableCell>{p.name}</TableCell>
              <TableCell>
                {p.currency} {p.price}
              </TableCell>
              <TableCell>{p.features.map((f) => f.name).join(", ")}</TableCell>
              <TableCell>{p.status}</TableCell>
              <TableActionCell menuLabel={t("actions")}>
                <ButtonGroup className="ml-auto">
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("edit")}
                    tooltip={t("edit")}
                    onClick={() => {
                      loadFeatures();
                      updateForm.reset({
                        name: p.name,
                        price: p.price,
                        currency: p.currency,
                        status: p.status,
                        features: p.features.map((f) => ({
                          featureId: f.featureId,
                        })),
                      });
                      setEi(p);
                    }}
                  >
                    <Pencil />
                  </TooltipButton>
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("delete")}
                    tooltip={t("delete")}
                    onClick={() => setDi(p)}
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
            <DialogTitle>{t("createPlan")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="cpl-form" onSubmit={createForm.handleSubmit(hc)}>
              {pf("cpl", true)}
            </form>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCo(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="cpl-form" disabled={saving}>
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
            <DialogTitle>{t("editPlan")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {ei && (
              <form id="epl-form" onSubmit={updateForm.handleSubmit(hu)}>
                {pf("epl", false)}
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEi(null)}>
              {t("cancel")}
            </Button>
            <Button type="submit" form="epl-form" disabled={saving}>
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
            <DialogTitle>{t("deletePlan")}</DialogTitle>
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
