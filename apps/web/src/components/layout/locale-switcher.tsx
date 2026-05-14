"use client";

import { GlobeIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const locales: { value: string; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "zh", label: "中文" },
];

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const currentLabel = locales.find((l) => l.value === locale)?.label;

  function handleChange(value: string) {
    // biome-ignore lint/suspicious/noDocumentCookie: simple cookie setter for locale
    document.cookie = `locale=${value};path=/;max-age=31536000`;
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" />}>
        <div className="flex gap-1 items-center">
          <GlobeIcon className="size-4 text-muted-foreground" />
          <span>{currentLabel}</span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((l) => (
          <DropdownMenuItem key={l.value} onClick={() => handleChange(l.value)}>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
