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
import { Pencil, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
});

interface FeatureRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function FeatureTable() {
  const t = useTranslations("Pricing");
  const [search, setSearch] = useState("");
  const [ds, setDs] = useState("");
  const dr = useRef<NodeJS.Timeout | null>(null);
  const [ei, setEi] = useState<FeatureRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (dr.current) clearTimeout(dr.current);
    };
  }, []);

  const {
    items: features,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<FeatureRow>({
    queryKey: ["features", { search: ds || undefined }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.pricing.features.$get)({
        query: { limit, offset, search: ds || undefined },
      });
      const d = await res.json();
      return { items: d.features, total: d.total };
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

  function openEdit(f: FeatureRow) {
    updateForm.reset({
      name: f.name,
      description: f.description,
      status: f.status,
    });
    setEi(f);
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
      await withApiFeedback(appClient.api.pricing.features[":id"].$put)({
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

  const updateForm = useForm({ resolver: zodResolver(updateSchema) });

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={features.length === 0}
        emptyMessage="No features configured."
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
          </div>
        }
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("code")}</TableHead>
            <TableHead>{t("name")}</TableHead>
            <TableHead>{t("descriptionLabel")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {features.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-mono text-xs">{f.code}</TableCell>
              <TableCell>{f.name}</TableCell>
              <TableCell>{f.description}</TableCell>
              <TableCell>{f.status}</TableCell>
              <TableActionCell
                menuLabel={t("actions")}
                menu={
                  <DropdownMenuItem onClick={() => openEdit(f)}>
                    <Pencil />
                    {t("edit")}
                  </DropdownMenuItem>
                }
              >
                <ButtonGroup className="ml-auto">
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("edit")}
                    tooltip={t("edit")}
                    onClick={() => openEdit(f)}
                  >
                    <Pencil />
                  </TooltipButton>
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      <Dialog
        open={!!ei}
        onOpenChange={(o) => {
          if (!o) setEi(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Feature — {ei?.code}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {ei && (
              <form id="eff-form" onSubmit={updateForm.handleSubmit(hu)}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="eff-name">{t("name")}</FieldLabel>
                    <Input
                      id="eff-name"
                      {...(updateForm.register("name") as object)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="eff-desc">
                      {t("descriptionLabel")}
                    </FieldLabel>
                    <Input
                      id="eff-desc"
                      {...(updateForm.register("description") as object)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="eff-st">{t("status")}</FieldLabel>
                    <Input
                      id="eff-st"
                      {...(updateForm.register("status") as object)}
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
            <Button type="submit" form="eff-form" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
