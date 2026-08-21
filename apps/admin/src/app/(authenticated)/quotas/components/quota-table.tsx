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
  allocated: z.coerce.number().int().min(0),
  used: z.coerce.number().int().min(0),
});

interface QuotaRow {
  id: string;
  userId: string;
  allocated: number;
  used: number;
  user: { id: string; name: string; email: string | null };
  createdAt: string;
  updatedAt: string;
}

export function QuotaTable() {
  const t = useTranslations("Pricing");
  const [search, setSearch] = useState("");
  const [ds, setDs] = useState("");
  const dr = useRef<NodeJS.Timeout | null>(null);
  const [ei, setEi] = useState<QuotaRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (dr.current) clearTimeout(dr.current);
    };
  }, []);

  const {
    items: quotas,
    total,
    page,
    pageSize,
    loading,
    setPage,
    refresh,
  } = usePaginatedQuery<QuotaRow>({
    queryKey: ["quotas", { search: ds || undefined }],
    queryFn: async ({ limit, offset }) => {
      const res = await withApiFeedback(appClient.api.pricing.quotas.$get)({
        query: { limit, offset, search: ds || undefined },
      });
      const d = await res.json();
      return { items: d.quotas, total: d.total };
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

  function openEdit(q: QuotaRow) {
    updateForm.reset({
      allocated: q.allocated,
      used: q.used,
    });
    setEi(q);
  }

  async function hu() {
    if (!ei) return;
    setSaving(true);
    try {
      const b = updateForm.getValues();
      await withApiFeedback(appClient.api.pricing.quotas[":id"].$put)({
        param: { id: ei.id },
        json: updateSchema.parse(b),
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

  const updateForm = useForm({
    resolver: zodResolver(updateSchema),
  });

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={quotas.length === 0}
        emptyMessage="No quotas configured."
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
            <TableHead>{t("name")}</TableHead>
            <TableHead align="center">Allocated</TableHead>
            <TableHead align="center">Used</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotas.map((q) => (
            <TableRow key={q.id}>
              <TableCell>
                <div>
                  <div>{q.user.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {q.user.email ?? "-"}
                  </div>
                </div>
              </TableCell>
              <TableCell align="center">{q.allocated}</TableCell>
              <TableCell align="center">{q.used}</TableCell>
              <TableActionCell
                menuLabel={t("actions")}
                menu={
                  <DropdownMenuItem onClick={() => openEdit(q)}>
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
                    onClick={() => openEdit(q)}
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
            <DialogTitle>Edit Quota — {ei?.user.email ?? "-"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {ei && (
              <form id="eq-form" onSubmit={updateForm.handleSubmit(hu)}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="eq-allocated" required>
                      Allocated
                    </FieldLabel>
                    <Input
                      id="eq-allocated"
                      type="number"
                      aria-invalid={!!updateForm.formState.errors.allocated}
                      {...(updateForm.register("allocated") as object)}
                    />
                    <FieldError
                      errors={
                        updateForm.formState.errors.allocated
                          ? [updateForm.formState.errors.allocated]
                          : undefined
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="eq-used" required>
                      Used
                    </FieldLabel>
                    <Input
                      id="eq-used"
                      type="number"
                      aria-invalid={!!updateForm.formState.errors.used}
                      {...(updateForm.register("used") as object)}
                    />
                    <FieldError
                      errors={
                        updateForm.formState.errors.used
                          ? [updateForm.formState.errors.used]
                          : undefined
                      }
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
            <Button type="submit" form="eq-form" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
