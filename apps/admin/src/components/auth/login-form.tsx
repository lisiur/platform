"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { apiWithFeedback } from "@/lib/api/utils";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

type LoginInput = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("Auth");
  const tc = useTranslations("Common");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setError(null);
    try {
      await apiWithFeedback(appClient.api.auth["sign-in"].email.$post)({
        json: data,
      });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginFailed"));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FieldGroup>
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
        {isSubmitting ? t("signingIn") : t("signIn")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-primary underline-offset-4 hover:underline"
        >
          {t("createOne")}
        </button>
      </p>
    </form>
  );
}
