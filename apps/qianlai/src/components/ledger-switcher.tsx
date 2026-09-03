"use client";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from "@repo/ui";
import { BookOpen, Check, ChevronsUpDown, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLedgers } from "@/hooks/use-ledgers";
import { useLedgerStore } from "@/stores/ledger-store";

export function LedgerSwitcher() {
  const t = useTranslations("LedgerSwitcher");
  const tLedger = useTranslations("Ledgers");
  const router = useRouter();
  const { ledgers, activeLedger, isLoading } = useLedgers();
  const setActiveLedger = useLedgerStore((s) => s.setActiveLedger);

  if (isLoading) {
    return (
      <div className="flex h-8 items-center justify-center">
        <Spinner className="h-4 w-4" />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={
          "flex h-8 w-full items-center gap-2 rounded-md border px-2 text-left text-sm " +
          "hover:bg-accent hover:text-accent-foreground"
        }
        aria-label={t("label")}
      >
        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">
          {activeLedger?.name ?? t("label")}
        </span>
        {activeLedger?.shared && (
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
            {t("shared")}
          </Badge>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        </DropdownMenuGroup>
        {ledgers.length === 0 ? (
          <DropdownMenuItem disabled>
            <span className="text-muted-foreground">{t("empty")}</span>
          </DropdownMenuItem>
        ) : (
          ledgers.map((ledger) => (
            <DropdownMenuItem
              key={ledger.id}
              onClick={() => setActiveLedger(ledger.id)}
            >
              <Check
                className={
                  ledger.id === activeLedger?.id ? "opacity-100" : "opacity-0"
                }
              />
              <span className="flex-1 truncate">{ledger.name}</span>
              {ledger.status === "archived" && (
                <span className="text-muted-foreground text-xs">
                  {tLedger("archive")}
                </span>
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/ledgers")}>
          <Settings2 />
          {t("manage")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
