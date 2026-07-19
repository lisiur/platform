"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { passwordSchema } from "@repo/shared";
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
} from "@repo/ui";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";

interface RegisterFormProps {
  onSuccess?: () => void | Promise<void>;
  onSwitchToLogin?: () => void;
}

export function RegisterForm({
  onSuccess,
  onSwitchToLogin,
}: RegisterFormProps) {
  const t = useTranslations("Auth");
  const tc = useTranslations("Common");

  const registerSchema = z.object({
    name: z.string().min(1, tc("required", { field: tc("name") })),
    email: z
      .string()
      .min(1, tc("required", { field: tc("email") }))
      .email(t("invalidEmail")),
    password: passwordSchema(t("passwordTooShort")),
  });

  type RegisterInput = z.infer<typeof registerSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(data: RegisterInput) {
    await withApiFeedback(appClient.api.auth["sign-up"].email.$post, {
      showError: false,
    })({
      json: data,
    });
    await onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">{tc("name")}</FieldLabel>
          <Input
            id="name"
            type="text"
            placeholder={t("namePlaceholder")}
            {...register("name")}
          />
          <FieldError errors={errors.name ? [errors.name] : undefined} />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">{tc("email")}</FieldLabel>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            {...register("email")}
          />
          <FieldError errors={errors.email ? [errors.email] : undefined} />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">{tc("password")}</FieldLabel>
          <Input
            id="password"
            type="password"
            placeholder="********"
            {...register("password")}
          />
          <FieldError
            errors={errors.password ? [errors.password] : undefined}
          />
        </Field>
      </FieldGroup>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("creatingAccount") : t("createAccountBtn")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-primary underline-offset-4 hover:underline"
        >
          {t("signIn")}
        </button>
      </p>
    </form>
  );
}
