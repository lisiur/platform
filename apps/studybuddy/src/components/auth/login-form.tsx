"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  isWebAuthnCancellation,
  useRegistrationEnabled,
  useWebAuthnEnabled,
} from "@repo/frontend";
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  InputPassword,
} from "@repo/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { UserKey } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { appClient, withApiFeedback } from "@/lib/api";

export function LoginForm({
  onSuccess,
  onSwitchToRegister,
}: {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const t = useTranslations("Auth");
  const tc = useTranslations("Common");
  const { registrationEnabled } = useRegistrationEnabled(async () => {
    const res = await appClient.api.auth["registration-status"].$get();
    return (await res.json()).registrationEnabled;
  });
  const { webauthnEnabled } = useWebAuthnEnabled(async () => {
    const res = await appClient.api.auth.webauthn.status.$get();
    return (await res.json()).webauthnEnabled;
  });

  const loginSchema = z.object({
    email: z.string().min(1, tc("required", { field: tc("email") })),
    password: z.string().min(1, tc("required", { field: tc("password") })),
  });

  type LoginInput = z.infer<typeof loginSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setError(null);
    try {
      await withApiFeedback(appClient.api.auth["sign-in"].email.$post, {
        showError: false,
      })({
        json: data,
      });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginFailed"));
    }
  }

  async function handleBiometricLogin() {
    setBiometricError(null);
    setIsBiometricLoading(true);
    try {
      const optionsRes = await appClient.api.auth.webauthn[
        "login-options"
      ].$post({
        json: {},
      });
      if (!optionsRes.ok) {
        const err = await optionsRes.json();
        throw new Error(
          (err as { message?: string }).message ||
            "Failed to get login options",
        );
      }

      const options =
        (await optionsRes.json()) as PublicKeyCredentialRequestOptionsJSON;

      const credential = await startAuthentication({
        optionsJSON: options,
      });

      const verifyRes = await appClient.api.auth.webauthn["login-verify"].$post(
        {
          json: { credential },
        },
      );
      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(
          (err as { message?: string }).message || "Login failed",
        );
      }

      onSuccess?.();
    } catch (err) {
      if (!isWebAuthnCancellation(err)) {
        setBiometricError(
          err instanceof Error ? err.message : t("biometricLoginFailed"),
        );
      }
    } finally {
      setIsBiometricLoading(false);
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
          <InputPassword
            id="password"
            placeholder="********"
            {...register("password")}
          />
          <FieldError
            errors={errors.password ? [errors.password] : undefined}
          />
        </Field>
      </FieldGroup>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {biometricError && (
        <p className="text-sm text-destructive">{biometricError}</p>
      )}

      <Button type="submit" className="w-full">
        {t("signIn")}
      </Button>

      {webauthnEnabled && (
        <div className="flex items-center gap-3">
          <span className="flex-1 border-t" />
          <span className="text-xs text-muted-foreground">{t("or")}</span>
          <span className="flex-1 border-t" />
        </div>
      )}

      {webauthnEnabled && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleBiometricLogin}
          disabled={isBiometricLoading}
        >
          <UserKey />
          {isBiometricLoading ? t("signingIn") : t("signInWithPasskey")}
        </Button>
      )}

      {registrationEnabled && (
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
      )}
    </form>
  );
}
