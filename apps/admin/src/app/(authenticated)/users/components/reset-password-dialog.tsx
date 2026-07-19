"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { passwordSchema } from "@repo/shared";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";

interface ResetPasswordDialogProps {
  user: {
    id: string;
    name: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: ResetPasswordDialogProps) {
  const t = useTranslations("Users");

  const formSchema = z
    .object({
      newPassword: passwordSchema(t("validation.newPasswordMin")),
      confirmPassword: z
        .string()
        .min(1, t("validation.confirmPasswordRequired")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("validation.passwordsMismatch"),
      path: ["confirmPassword"],
    });

  type PasswordInput = z.infer<typeof formSchema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordInput>({
    resolver: zodResolver(formSchema),
  });

  async function onSubmit(data: PasswordInput) {
    try {
      await withApiFeedback(appClient.api.users[":id"]["reset-password"].$post)(
        {
          param: { id: user.id },
          json: { password: data.newPassword },
        },
      );
      reset();
      onSuccess();
    } catch {
      // Error handled by withApiFeedback
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("resetPassword")}</DialogTitle>
          <DialogDescription>
            {t("resetPasswordDescription")} <strong>{user.name}</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form
            id="reset-password-form"
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FieldGroup>
              <Field data-invalid={!!errors.newPassword}>
                <FieldLabel htmlFor="newPassword">
                  {t("newPassword")}
                </FieldLabel>
                <Input
                  id="newPassword"
                  type="password"
                  aria-invalid={!!errors.newPassword}
                  {...register("newPassword")}
                />
                <FieldError
                  errors={errors.newPassword ? [errors.newPassword] : undefined}
                />
              </Field>
              <Field data-invalid={!!errors.confirmPassword}>
                <FieldLabel htmlFor="confirmPassword">
                  {t("confirmPassword")}
                </FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  aria-invalid={!!errors.confirmPassword}
                  {...register("confirmPassword")}
                />
                <FieldError
                  errors={
                    errors.confirmPassword
                      ? [errors.confirmPassword]
                      : undefined
                  }
                />
              </Field>
            </FieldGroup>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="reset-password-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? t("resetting") : t("resetPassword")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
