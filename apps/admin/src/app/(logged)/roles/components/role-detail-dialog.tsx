"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RoleInfo {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  permissions: Record<string, string[]>;
}

interface RoleDetailDialogProps {
  role: RoleInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoleDetailDialog({
  role,
  open,
  onOpenChange,
}: RoleDetailDialogProps) {
  const t = useTranslations("Roles");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-none sm:max-w-none overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {role.icon}
            {t(role.name)}
          </DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <p className="text-muted-foreground">{t(role.description)}</p>

          {Object.entries(role.permissions).map(([resource, actions]) => (
            <div key={resource} className="space-y-2">
              <h4 className="font-medium text-sm">{resource}</h4>
              <Table
                className="w-auto table-fixed"
                style={{ width: actions.length * 100 }}
              >
                <TableHeader>
                  <TableRow>
                    {actions.map((action) => (
                      <TableHead
                        key={action}
                        className="text-center whitespace-normal"
                        style={{ width: 100 }}
                      >
                        {action}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    {actions.map((action) => (
                      <TableCell
                        key={action}
                        className="text-center"
                        style={{ width: 100 }}
                      >
                        <CheckIcon className="mx-auto h-4 w-4 text-green-500" />
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
