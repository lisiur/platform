"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/api";

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
      const { error } = await authClient.changePassword({
        newPassword: data.newPassword,
        currentPassword: data.currentPassword,
      });
      if (error) throw new Error(error.message);
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
      <div className="flex flex-col gap-2">
        <label htmlFor="currentPassword" className="text-sm font-medium">
          {t("currentPassword")}
        </label>
        <Input
          id="currentPassword"
          type="password"
          {...register("currentPassword")}
        />
        {errors.currentPassword && (
          <p className="text-sm text-destructive">
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="newPassword" className="text-sm font-medium">
          {t("newPassword")}
        </label>
        <Input id="newPassword" type="password" {...register("newPassword")} />
        {errors.newPassword && (
          <p className="text-sm text-destructive">
            {errors.newPassword.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          {t("confirmPassword")}
        </label>
        <Input
          id="confirmPassword"
          type="password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? t("changing") : t("changeBtn")}
        </Button>
      </div>
    </form>
  );
}
