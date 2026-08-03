"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";

interface OrgInfoFormProps {
  organizationId: string;
  initialName: string;
  initialSlug: string;
  onUpdated: (org: { name: string; slug: string }) => void;
}

export function OrgInfoForm({
  organizationId,
  initialName,
  initialSlug,
  onUpdated,
}: OrgInfoFormProps) {
  const t = useTranslations("Settings");
  const [saving, setSaving] = useState(false);

  const settingsSchema = z.object({
    name: z.string().min(1, t("validation.nameRequired")),
    slug: z
      .string()
      .min(1, t("validation.slugRequired"))
      .regex(/^[a-z0-9-]+$/, t("invalidSlug")),
  });

  type SettingsInput = z.infer<typeof settingsSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    values: { name: initialName, slug: initialSlug },
  });

  async function onSubmit(data: SettingsInput) {
    setSaving(true);
    try {
      const res = await withApiFeedback(
        appClient.api.organizations[":id"].settings.$put,
      )({
        param: { id: organizationId },
        json: { name: data.name, slug: data.slug },
      });
      const org = await res.json();
      onUpdated({ name: org.name, slug: org.slug });
      toast.success(t("updateSuccess"));
    } catch {
      // Error handled by withApiFeedback
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="org-name">{t("name")}</FieldLabel>
          <Input
            id="org-name"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          <FieldError errors={errors.name ? [errors.name] : undefined} />
        </Field>
        <Field data-invalid={!!errors.slug}>
          <FieldLabel htmlFor="org-slug">{t("slug")}</FieldLabel>
          <Input
            id="org-slug"
            aria-invalid={!!errors.slug}
            {...register("slug")}
          />
          <FieldDescription>{t("slugDescription")}</FieldDescription>
          <FieldError errors={errors.slug ? [errors.slug] : undefined} />
        </Field>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !isDirty}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
