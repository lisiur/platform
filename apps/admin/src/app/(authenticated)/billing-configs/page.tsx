"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ManagementPageShell } from "@/components/management-page-shell";
import { appClient } from "@/lib/api";
import { useHasPermission } from "@/lib/api/use-has-permission";
import { withApiFeedback } from "@/lib/api/utils";
import { BillingConfigTable } from "./components/billing-config-table";

interface ConfigItem {
  id: string;
  group: string;
  key: string;
  value: string;
  type: string;
  label: string;
  description?: string | null;
  schema?: unknown | null;
  isSecret: boolean;
  mask?: string | null;
  sortOrder: number;
}

function CreditConversionConfig() {
  const t = useTranslations("BillingConfigs");
  const canUpdate = useHasPermission("system/system-config:batchUpsert");
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [creditsCurrency, setCreditsCurrency] = useState("CNY");
  const [creditsPerUnit, setCreditsPerUnit] = useState("100");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await withApiFeedback(
          appClient.api["system-config"][":group"].$get,
        )({ param: { group: "currency" } });
        const data = (await res.json()) as ConfigItem[];
        setItems(data);
        setCreditsCurrency(
          data.find((item) => item.key === "creditsCurrency")?.value ?? "CNY",
        );
        setCreditsPerUnit(
          data.find((item) => item.key === "creditsPerUnit")?.value ?? "100",
        );
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const values: Record<string, string> = {
        creditsCurrency,
        creditsPerUnit,
      };
      const payload = items
        .filter((item) => item.key in values)
        .filter((item) => values[item.key] !== item.value)
        .map((item) => ({
          group: item.group,
          key: item.key,
          value: values[item.key],
          schema:
            (item.schema as Record<string, unknown> | undefined) ?? undefined,
          type: item.type as
            | "string"
            | "number"
            | "boolean"
            | "json"
            | "select",
          label: item.label,
          description: item.description ?? undefined,
          isSecret: item.isSecret,
          mask: item.mask ?? undefined,
          sortOrder: item.sortOrder,
        }));
      if (payload.length === 0) return;

      await withApiFeedback(appClient.api["system-config"].batch.$put)({
        json: { items: payload },
      });
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          value: values[item.key] ?? item.value,
        })),
      );
      toast.success(t("creditRuleSaved"));
    } catch {
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("creditRuleTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <FieldDescription>{t("creditRuleDescription")}</FieldDescription>
          <FieldGroup className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <Field>
              <FieldLabel>{t("creditsCurrency")}</FieldLabel>
              <Select
                value={creditsCurrency}
                onValueChange={(value) => setCreditsCurrency(value ?? "CNY")}
                disabled={loading || saving || !canUpdate}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNY">{t("currencyCNY")}</SelectItem>
                  <SelectItem value="USD">{t("currencyUSD")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t("creditsPerUnit")}</FieldLabel>
              <Input
                type="number"
                min="0"
                step="1"
                value={creditsPerUnit}
                disabled={loading || saving || !canUpdate}
                onChange={(event) => setCreditsPerUnit(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={loading || saving || !canUpdate}>
              {saving ? t("saving") : t("saveCreditRule")}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export default function BillingConfigsPage() {
  const t = useTranslations("BillingConfigs");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <div className="flex-1 space-y-6 overflow-y-auto">
        <CreditConversionConfig />
        <BillingConfigTable />
      </div>
    </ManagementPageShell>
  );
}
