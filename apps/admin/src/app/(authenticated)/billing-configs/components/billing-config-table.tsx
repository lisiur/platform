"use client";

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
  TableActionCell,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipButton,
} from "@repo/ui";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { usePaginatedQuery } from "@/hooks/use-paginated-query";
import { appClient } from "@/lib/api";
import { useHasPermission } from "@/lib/api/use-has-permission";
import { withApiFeedback } from "@/lib/api/utils";

interface BillingConfigRow {
  id: string;
  resourceType: string;
  resourceId: string;
  billingType: string;
  priceUnit: string;
  priceAmount: number;
  status: string;
  description: string | null;
  updatedAt: string;
}

type BillingType = "cost_based" | "per_call" | "none";
type BillingStatus = "active" | "disabled";
type BillingForm = {
  resourceType: string;
  resourceId: string;
  billingType: BillingType;
  priceUnit: string;
  priceAmount: string;
  status: BillingStatus;
  description: string;
};

const emptyForm: BillingForm = {
  resourceType: "ai_agent",
  resourceId: "",
  billingType: "none",
  priceUnit: "credit",
  priceAmount: "0",
  status: "active",
  description: "",
};

export function BillingConfigTable() {
  const t = useTranslations("BillingConfigs");
  const canUpdate = useHasPermission("system/billing-config:update");
  const [editItem, setEditItem] = useState<BillingConfigRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { items, total, page, pageSize, loading, setPage, refresh } =
    usePaginatedQuery<BillingConfigRow>({
      queryKey: ["billing-configs"],
      queryFn: async ({ limit, offset }) => {
        const res = await withApiFeedback(appClient.api.billing.configs.$get)({
          query: { limit, offset },
        });
        const data = await res.json();
        return { items: data.configs, total: data.total };
      },
    });

  function openEdit(item: BillingConfigRow) {
    setForm({
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      billingType: item.billingType as BillingType,
      priceUnit: item.priceUnit,
      priceAmount: String(item.priceAmount),
      status: item.status as BillingStatus,
      description: item.description ?? "",
    });
    setEditItem(item);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        priceAmount: Number(form.priceAmount),
        description: form.description || null,
      };
      if (!editItem) return;
      await withApiFeedback(appClient.api.billing.configs[":id"].$put)({
        param: { id: editItem.id },
        json: payload,
      });
      setEditItem(null);
      toast.success(t("updated"));
      refresh();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PaginatedTableFrame
        loading={loading}
        empty={items.length === 0}
        emptyMessage={t("empty")}
        page={page}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      >
        <TableHeader sticky>
          <TableRow>
            <TableHead>{t("resourceType")}</TableHead>
            <TableHead>{t("resourceId")}</TableHead>
            <TableHead>{t("billingType")}</TableHead>
            <TableHead>{t("price")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableActionHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-mono text-xs">
                {item.resourceType}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {item.resourceId}
              </TableCell>
              <TableCell>{item.billingType}</TableCell>
              <TableCell className="font-mono">
                {item.priceAmount} {item.priceUnit}
              </TableCell>
              <TableCell>{item.status}</TableCell>
              <TableActionCell menuLabel={t("actions")}>
                <ButtonGroup className="ml-auto">
                  {canUpdate && (
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("edit")}
                      tooltip={t("edit")}
                      onClick={() => openEdit(item)}
                    >
                      <Pencil />
                    </TooltipButton>
                  )}
                </ButtonGroup>
              </TableActionCell>
            </TableRow>
          ))}
        </TableBody>
      </PaginatedTableFrame>

      <Dialog
        open={!!editItem}
        onOpenChange={(open) => {
          if (!open) {
            setEditItem(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form
              id="billing-config-form"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <FieldGroup>
                <Field>
                  <FieldLabel>{t("resourceType")}</FieldLabel>
                  <Input
                    value={form.resourceType}
                    onChange={(event) =>
                      setForm({ ...form, resourceType: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("resourceId")}</FieldLabel>
                  <Input
                    value={form.resourceId}
                    onChange={(event) =>
                      setForm({ ...form, resourceId: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("billingType")}</FieldLabel>
                  <Select
                    value={form.billingType}
                    onValueChange={(value) =>
                      setForm({ ...form, billingType: value as BillingType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">none</SelectItem>
                      <SelectItem value="cost_based">cost_based</SelectItem>
                      <SelectItem value="per_call">per_call</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>{t("priceUnit")}</FieldLabel>
                  <Input
                    value={form.priceUnit}
                    onChange={(event) =>
                      setForm({ ...form, priceUnit: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("priceAmount")}</FieldLabel>
                  <Input
                    type="number"
                    step="0.000001"
                    value={form.priceAmount}
                    onChange={(event) =>
                      setForm({ ...form, priceAmount: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>{t("status")}</FieldLabel>
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      setForm({ ...form, status: value as BillingStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="disabled">disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>{t("descriptionLabel")}</FieldLabel>
                  <Input
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                  />
                </Field>
              </FieldGroup>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditItem(null);
              }}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" form="billing-config-form" disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
