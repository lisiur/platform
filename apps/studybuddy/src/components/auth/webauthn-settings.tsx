"use client";

import { detectDevicePlatform, isWebAuthnCancellation } from "@repo/frontend";
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
  FieldLabel,
  Input,
} from "@repo/ui";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { appClient } from "@/lib/api";

interface WebAuthnCredential {
  id: string;
  credentialId: string;
  deviceType: "platform" | "cross-platform";
  deviceName: string;
  createdAt: string;
}

interface WebAuthnSettingsProps {
  credentials: WebAuthnCredential[];
  onCredentialsChange?: () => void;
}

export function WebAuthnSettings({
  credentials,
  onCredentialsChange,
}: WebAuthnSettingsProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const t = useTranslations("Profile");

  useEffect(() => {
    const platform = detectDevicePlatform();
    if (platform) setDeviceName(platform);
  }, []);

  async function handleRegisterDevice() {
    setError(null);
    setIsRegistering(true);

    try {
      const optionsRes =
        await appClient.api.auth.webauthn["register-options"].$post();
      if (!optionsRes.ok) {
        const err = await optionsRes.json();
        throw new Error(
          (err as { message?: string }).message ||
            "Failed to get registration options",
        );
      }

      const options =
        (await optionsRes.json()) as PublicKeyCredentialCreationOptionsJSON;

      const credential = await startRegistration({
        optionsJSON: options,
      });

      const verifyRes = await appClient.api.auth.webauthn[
        "register-verify"
      ].$post({
        json: { credential, deviceName: deviceName.trim() || undefined },
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(
          (err as { message?: string }).message || "Failed to register device",
        );
      }

      onCredentialsChange?.();
      setShowRegisterDialog(false);
      setDeviceName(detectDevicePlatform());
    } catch (err) {
      if (isWebAuthnCancellation(err)) {
        setError(t("biometricRegistrationCancelled"));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("biometricRegistrationFailed"));
      }
    } finally {
      setIsRegistering(false);
    }
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      setError(null);
      setDeviceName(detectDevicePlatform());
    }
    setShowRegisterDialog(open);
  }

  async function handleRemoveCredential(credentialId: string) {
    setIsRemoving(credentialId);
    try {
      const res = await appClient.api.auth.webauthn.credentials.$delete({
        json: { credentialId },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(
          (err as { message?: string }).message ||
            "Failed to remove credential",
        );
      }

      onCredentialsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("biometricRemoveFailed"));
    } finally {
      setIsRemoving(null);
    }
  }

  return (
    <div className="space-y-4">
      {credentials.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("devicesEnrolled", { count: credentials.length })}
          </p>
          <div className="space-y-2">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="text-sm">
                    <p className="font-medium">{cred.deviceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {cred.deviceType === "platform"
                        ? t("platformAuthenticator")
                        : t("securityKey")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCredential(cred.id)}
                  disabled={isRemoving === cred.id}
                >
                  {isRemoving === cred.id ? t("removing") : t("remove")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("biometricNotSetup")}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        onClick={() => setShowRegisterDialog(true)}
        disabled={isRegistering}
        className="w-full"
      >
        {credentials.length > 0 ? t("registerNewDevice") : t("setupBiometric")}
      </Button>

      <Dialog open={showRegisterDialog} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("registerDeviceTitle")}</DialogTitle>
            <DialogDescription>
              {t("registerDeviceDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Field>
              <FieldLabel htmlFor="device-name">{t("deviceName")}</FieldLabel>
              <Input
                id="device-name"
                type="text"
                placeholder={t("deviceNamePlaceholder")}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                maxLength={128}
                disabled={isRegistering}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={isRegistering}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleRegisterDevice}
              disabled={isRegistering}
            >
              {isRegistering ? t("registeringDevice") : t("register")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
