"use client";

import { Button } from "@repo/ui";
import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Shown on ledger-scoped pages (dashboard, journal) when the user has no
 * ledger at all — a valid state since ledgers are user-created.
 */
export function NoLedgerState() {
  const t = useTranslations("NoLedger");
  const router = useRouter();

  return (
    <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <BookOpen className="size-6" />
      </div>
      <p className="font-medium">{t("title")}</p>
      <p className="text-muted-foreground max-w-sm text-sm">
        {t("description")}
      </p>
      <Button className="mt-2" onClick={() => router.push("/ledgers")}>
        <BookOpen className="h-4 w-4" />
        {t("cta")}
      </Button>
    </div>
  );
}
