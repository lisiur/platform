"use client";

import { useTranslations } from "next-intl";

export default function OrganizationHomePage() {
  const t = useTranslations("Home");

  return (
    <div className="flex flex-1 items-center justify-center">
      <section className="w-full max-w-3xl rounded-3xl border bg-background p-8 shadow-sm md:p-10">
        <div className="mb-6 inline-flex rounded-full border px-3 py-1 text-sm font-medium text-muted-foreground">
          {t("eyebrow")}
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            {t("description")}
          </p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-sm font-medium text-muted-foreground">
              {t("statusLabel")}
            </p>
            <p className="mt-2 text-xl font-semibold">{t("status")}</p>
          </div>
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-sm font-medium text-muted-foreground">
              {t("nextStepLabel")}
            </p>
            <p className="mt-2 text-sm leading-6">{t("nextStep")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
