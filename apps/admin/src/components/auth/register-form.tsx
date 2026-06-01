"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { appClient } from "@/lib/api";
import { apiWithFeedback } from "@/lib/api/utils";

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(6),
});
type RegisterInput = z.infer<typeof registerSchema>;

interface RegisterFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export function RegisterForm({
  onSuccess,
  onSwitchToLogin,
}: RegisterFormProps) {
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("Auth");
  const tc = useTranslations("Common");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(data: RegisterInput) {
    setError(null);
    try {
      await apiWithFeedback(appClient.api.auth["sign-up"].email.$post)({
        json: data,
      });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("registrationFailed"));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">{tc("name")}</FieldLabel>
          <Input
            id="name"
            type="text"
            placeholder="Your name"
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
            placeholder="••••••••"
            {...register("password")}
          />
          <FieldError
            errors={errors.password ? [errors.password] : undefined}
          />
        </Field>
      </FieldGroup>

      {error && <p className="text-sm text-destructive">{error}</p>}

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
