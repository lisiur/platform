"use client";

import {
  Badge,
  Button,
  Spinner,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient, withApiFeedback } from "@/lib/api";
import { formatDate } from "@/utils/date";
import { DepartmentBreadcrumb } from "./department-breadcrumb";
import { DepartmentDialog } from "./department-dialog";
import { DepartmentMembersDialog } from "./department-members-dialog";

interface DepartmentRow {
  id: string;
  organizationId: string;
  parentId: string | null;
  name: string;
  code: string;
  description?: string | null;
  childrenCount: number;
  createdAt: string;
}

interface DepartmentBreadcrumbItem {
  id: string;
  name: string;
}

interface DepartmentTableProps {
  orgId: string;
}

export function DepartmentTable({ orgId }: DepartmentTableProps) {
  const t = useTranslations("Departments");
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [path, setPath] = useState<DepartmentBreadcrumbItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editDepartment, setEditDepartment] = useState<DepartmentRow | null>(
    null,
  );
  const [manageMembersDept, setManageMembersDept] =
    useState<DepartmentRow | null>(null);

  const { data: departments, isLoading } = useQuery({
    queryKey: ["departments", orgId],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.organizations[":orgId"].departments.$get,
      )({ param: { orgId } });
      const data = await res.json();
      return data.departments as DepartmentRow[];
    },
  });

  const filteredDepartments =
    departments?.filter((d) => d.parentId === currentParentId) ?? [];

  function handleNavigate(departmentId: string | null) {
    if (departmentId === null) {
      setCurrentParentId(null);
      setPath([]);
      return;
    }
    const dept = departments?.find((d) => d.id === departmentId);
    if (!dept) return;

    const existingIndex = path.findIndex((p) => p.id === departmentId);
    if (existingIndex >= 0) {
      setPath(path.slice(0, existingIndex + 1));
    } else {
      setPath([...path, { id: dept.id, name: dept.name }]);
    }
    setCurrentParentId(departmentId);
  }

  async function handleDelete(department: DepartmentRow) {
    const confirmed = await confirm({
      title: t("confirmDeleteTitle"),
      description: t("confirmDeleteDescription", { name: department.name }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;

    try {
      await withApiFeedback(
        appClient.api.organizations[":orgId"].departments[":id"].$delete,
      )({
        param: { orgId, id: department.id },
      });
      queryClient.invalidateQueries({ queryKey: ["departments", orgId] });
      toast.success(t("deleteSuccess"));
    } catch {
      // Error handled by withApiFeedback
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <DepartmentBreadcrumb path={path} onNavigate={handleNavigate} />
      <div className="mb-4 shrink-0">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("createDepartment")}
        </Button>
      </div>
      {filteredDepartments.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full caption-bottom text-sm">
            <TableHeader sticky>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("description_label")}</TableHead>
                <TableHead>{t("children")}</TableHead>
                <TableHead>{t("createdAt")}</TableHead>
                <TableHead sticky="right" align="right">
                  {t("edit")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDepartments.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell className="font-medium">{dept.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{dept.code}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {dept.description ?? "—"}
                  </TableCell>
                  <TableCell>{dept.childrenCount}</TableCell>
                  <TableCell>{formatDate(dept.createdAt)}</TableCell>
                  <TableCell sticky="right" align="right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t("manage")}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigate(dept.id);
                        }}
                      >
                        <FolderTree className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t("manageMembers")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setManageMembersDept(dept);
                        }}
                      >
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t("edit")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditDepartment(dept);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={t("delete")}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(dept);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}
      <DepartmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        parentId={currentParentId}
      />
      {editDepartment && (
        <DepartmentDialog
          open={!!editDepartment}
          onOpenChange={(open) => !open && setEditDepartment(null)}
          orgId={orgId}
          department={editDepartment}
        />
      )}
      {manageMembersDept && (
        <DepartmentMembersDialog
          open={!!manageMembersDept}
          onOpenChange={(open) => !open && setManageMembersDept(null)}
          orgId={orgId}
          departmentId={manageMembersDept.id}
          departmentName={manageMembersDept.name}
        />
      )}
    </>
  );
}
