"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from "@repo/ui";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";

export function LedgerStep() {
  const t = useTranslations("Onboarding");
  const tLedgers = useTranslations("Ledgers");
  const [created, setCreated] = useState(false);

  const ledgerSchema = z.object({
    name: z.string().min(1, t("ledgerNameRequired")),
    description: z.string().optional(),
  });

  type LedgerInput = z.infer<typeof ledgerSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LedgerInput>({
    resolver: zodResolver(ledgerSchema),
    defaultValues: { name: "", description: "" },
  });

  async function onSubmit(data: LedgerInput) {
    try {
      await withApiFeedback(appClient.api.bookkeeping.ledgers.$post)({
        json: {
          name: data.name,
          description: data.description || undefined,
        },
      });
      setCreated(true);
      toast.success(tLedgers("createSuccess"));
    } catch {
      // Errors are surfaced by withApiFeedback.
    }
  }

  if (created) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <CheckCircle2 className="text-emerald-600 dark:text-emerald-400 h-4 w-4" />
        {t("ledgerCreated")}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="onboarding-ledger-name" required>
            {tLedgers("name")}
          </FieldLabel>
          <Input
            id="onboarding-ledger-name"
            aria-invalid={!!errors.name}
            {...register("name")}
            placeholder={tLedgers("namePlaceholder")}
          />
          <FieldError errors={errors.name ? [errors.name] : undefined} />
        </Field>
        <Field>
          <FieldLabel htmlFor="onboarding-ledger-description">
            {tLedgers("description_label")}
          </FieldLabel>
          <Textarea
            id="onboarding-ledger-description"
            {...register("description")}
            placeholder={tLedgers("descriptionPlaceholder")}
          />
        </Field>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          {isSubmitting ? t("saving") : t("ledgerCreate")}
        </Button>
      </div>
    </form>
  );
}
