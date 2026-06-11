"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

export function PasswordForm() {
  const t = useTranslations("Profile");
  const [saving, setSaving] = useState(false);

  const passwordSchema = z
    .object({
      currentPassword: z
        .string()
        .min(1, t("validation.currentPasswordRequired")),
      newPassword: z.string().min(6, t("validation.newPasswordMin")),
      confirmPassword: z
        .string()
        .min(1, t("validation.confirmPasswordRequired")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("validation.passwordsMismatch"),
      path: ["confirmPassword"],
    });

  type PasswordInput = z.infer<typeof passwordSchema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordInput>({
    resolver: zodResolver(passwordSchema),
  });

  async function onSubmit(data: PasswordInput) {
    setSaving(true);
    try {
      await withApiFeedback(appClient.api.auth["change-password"].$post)({
        json: {
          newPassword: data.newPassword,
          currentPassword: data.currentPassword,
        },
      });
      toast.success(t("passwordChanged"));
      reset();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("changePasswordFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="currentPassword">
            {t("currentPassword")}
          </FieldLabel>
          <Input
            id="currentPassword"
            type="password"
            {...register("currentPassword")}
          />
          <FieldError
            errors={
              errors.currentPassword ? [errors.currentPassword] : undefined
            }
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="newPassword">{t("newPassword")}</FieldLabel>
          <Input
            id="newPassword"
            type="password"
            {...register("newPassword")}
          />
          <FieldError
            errors={errors.newPassword ? [errors.newPassword] : undefined}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="confirmPassword">
            {t("confirmPassword")}
          </FieldLabel>
          <Input
            id="confirmPassword"
            type="password"
            {...register("confirmPassword")}
          />
          <FieldError
            errors={
              errors.confirmPassword ? [errors.confirmPassword] : undefined
            }
          />
        </Field>
      </FieldGroup>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? t("changing") : t("changeBtn")}
        </Button>
      </div>
    </form>
  );
}
