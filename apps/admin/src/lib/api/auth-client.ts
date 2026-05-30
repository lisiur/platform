"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string | null;
  flags: string[];
};

type AuthSession = {
  id: string;
  userId: string;
  expiresAt: string;
};

type SessionData = {
  user: AuthUser;
  session: AuthSession;
} | null;

type AuthResult<T> = {
  data?: T;
  error?: { message: string } | null;
};

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<AuthResult<T>> {
  const res = await fetch(`/api/auth${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      payload?.message ?? payload?.error?.message ?? "Request failed";
    toast.error(message);
    return { error: { message } };
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return payload as AuthResult<T>;
  }

  return { data: payload as T, error: null };
}

export const authClient = {
  signIn: {
    email(input: { email: string; password: string }) {
      return request<{ user: AuthUser; session: AuthSession }>(
        "/sign-in/email",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );
    },
  },
  signUp: {
    email(input: { name: string; email: string; password: string }) {
      return request<{ user: AuthUser; session: AuthSession }>(
        "/sign-up/email",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );
    },
  },
  signOut() {
    return request<{ success: boolean }>("/sign-out", { method: "POST" });
  },
  getSession() {
    return request<SessionData>("/get-session");
  },
  updateUser(input: { name?: string; image?: string | null }) {
    return request<{ user: AuthUser }>("/update-user", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  changePassword(input: { currentPassword: string; newPassword: string }) {
    return request<{ user: AuthUser }>("/change-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};

export function useSession() {
  const [data, setData] = useState<SessionData>(null);
  const [isPending, setIsPending] = useState(true);

  const refetch = useCallback(async () => {
    setIsPending(true);
    try {
      const result = await authClient.getSession();
      setData(result.data ?? null);
      return result;
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isPending, refetch };
}
