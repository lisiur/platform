"use client";

import { Button } from "@repo/ui";
import { ChevronRight, FolderTree } from "lucide-react";
import { useTranslations } from "next-intl";

export interface DepartmentBreadcrumbItem {
  id: string;
  name: string;
}

interface DepartmentBreadcrumbProps {
  path: DepartmentBreadcrumbItem[];
  onNavigate: (departmentId: string | null) => void;
}

export function DepartmentBreadcrumb({
  path,
  onNavigate,
}: DepartmentBreadcrumbProps) {
  const t = useTranslations("Departments");

  return (
    <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2"
        onClick={() => onNavigate(null)}
      >
        <FolderTree className="h-3.5 w-3.5" />
        {t("root")}
      </Button>
      {path.map((item) => (
        <span key={item.id} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => onNavigate(item.id)}
          >
            {item.name}
          </Button>
        </span>
      ))}
    </nav>
  );
}
