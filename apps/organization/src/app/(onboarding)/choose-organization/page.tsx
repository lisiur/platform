"use client";

import { useTranslations } from "next-intl";
import { OrganizationChooser } from "./components/organization-chooser";

export default function ChooseOrganizationPage() {
  const t = useTranslations("ChooseOrganization");

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <OrganizationChooser />
    </div>
  );
}
