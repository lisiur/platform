"use client";

import { Button } from "@repo/ui";
import { useCallback, useEffect, useRef, useState } from "react";

const APPLE_SDK_URL =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/async/en_US/appleid.auth.js";

export interface AppleSignInSuccess {
  identityToken: string;
  nonce: string;
  user?: { firstName?: string; lastName?: string };
}

export interface AppleSignInButtonProps {
  clientId: string;
  label: string;
  onSuccess: (result: AppleSignInSuccess) => void | Promise<void>;
  onError?: (error: Error) => void;
  /**
   * Registered redirect URI for the popup flow. Defaults to the current page
   * (origin + pathname) — the recommended setup, since this page already
   * loads the Apple SDK.
   */
  redirectUri?: string;
  disabled?: boolean;
}

interface AppleAuthResponse {
  authorization: {
    code: string;
    id_token?: string;
    state?: string;
  };
  user?: {
    name?: { firstName?: string; lastName?: string };
    email?: string;
  };
}

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init(config: Record<string, unknown>): void;
        signIn(): Promise<AppleAuthResponse>;
      };
    };
  }
}

let sdkLoadPromise: Promise<void> | null = null;

function loadAppleSdk(): Promise<void> {
  if (window.AppleID) return Promise.resolve();
  if (!sdkLoadPromise) {
    sdkLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = APPLE_SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        sdkLoadPromise = null;
        reject(new Error("Failed to load the Apple sign-in SDK"));
      };
      document.head.appendChild(script);
    });
  }
  return sdkLoadPromise;
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <title>Apple</title>
      <path d="M17.05 20.28c-.98.95-2.05.86-3.08.41-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export function AppleSignInButton({
  clientId,
  label,
  onSuccess,
  onError,
  redirectUri,
  disabled,
}: AppleSignInButtonProps) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef("");
  const nonceRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    loadAppleSdk()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (!window.AppleID || busy) return;
    setBusy(true);
    try {
      const state = randomToken();
      const nonce = randomToken();
      stateRef.current = state;
      nonceRef.current = nonce;

      window.AppleID.auth.init({
        clientId,
        scope: "name email",
        redirectURI:
          redirectUri ?? `${window.location.origin}${window.location.pathname}`,
        state,
        nonce,
        usePopup: true,
      });

      const response = await window.AppleID.auth.signIn();

      if (response.authorization.state !== stateRef.current) {
        throw new Error("Apple sign-in state mismatch");
      }
      const identityToken = response.authorization.id_token;
      if (!identityToken) {
        throw new Error("Apple did not return an identity token");
      }

      const name = response.user?.name;
      await onSuccess({
        identityToken,
        nonce: nonceRef.current,
        user: name
          ? { firstName: name.firstName, lastName: name.lastName }
          : undefined,
      });
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusy(false);
    }
  }, [busy, clientId, onError, onSuccess, redirectUri]);

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={disabled || !ready || busy}
      onClick={handleClick}
    >
      <AppleLogo />
      {label}
    </Button>
  );
}
