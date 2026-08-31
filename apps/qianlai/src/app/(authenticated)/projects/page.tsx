"use client";

import { useTranslations } from "next-intl";
import { ManagementPageShell } from "@/components/management-page-shell";
import { ProjectsView } from "./components/projects-view";

export default function ProjectsPage() {
  const t = useTranslations("Projects");

  return (
    <ManagementPageShell title={t("title")} description={t("description")}>
      <ProjectsView />
    </ManagementPageShell>
  );
}
