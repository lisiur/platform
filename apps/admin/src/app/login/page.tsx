"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { appClient } from "@/lib/api";

type MenuNode = {
  id: string;
  parentId?: string | null;
  url?: string | null;
  sortOrder: number;
};

function getFirstMenuUrl(menus: MenuNode[]): string | null {
  const parentIds = new Set<string>();
  for (const m of menus) {
    if (m.parentId) parentIds.add(m.parentId);
  }

  const sorted = [...menus].sort((a, b) => a.sortOrder - b.sortOrder);

  const roots = sorted.filter((m) => !m.parentId || !parentIds.has(m.id));
  function findFirstLeaf(nodes: MenuNode[]): string | null {
    for (const node of nodes) {
      const children = sorted.filter((m) => m.parentId === node.id);
      if (children.length === 0) {
        return node.url ?? null;
      }
      const leafUrl = findFirstLeaf(children);
      if (leafUrl) return leafUrl;
    }
    return null;
  }

  return findFirstLeaf(roots);
}

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("Auth");

  const handleLoginSuccess = async () => {
    try {
      const res = await appClient.api["menu-role"].mine.$get();
      if (res.ok) {
        const data = await res.json();
        const firstUrl = getFirstMenuUrl(data.menus);
        if (firstUrl) {
          router.push(firstUrl);
          return;
        }
      }
    } catch {
      // Fallback to dashboard
    }
    router.push("/");
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("welcomeBack")}</CardTitle>
          <CardDescription>{t("signInDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm
            onSuccess={handleLoginSuccess}
            onSwitchToRegister={() => router.push("/register")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
