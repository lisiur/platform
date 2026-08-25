"use client";

import { isBuiltinAccount } from "@repo/shared";
import {
  Badge,
  cn,
  DraggableTree,
  type DraggableTreeNode,
  type ReorderChange,
  TooltipButton,
} from "@repo/ui";
import {
  Archive,
  ArchiveRestore,
  GripVertical,
  Plus,
  Scale,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { type AccountLike, useAccountName } from "@/hooks/use-account-name";
import type { AccountRow } from "./accounts-table";

interface AccountTreeNode extends DraggableTreeNode {
  account: AccountRow;
}

function buildAccountTree(
  accounts: AccountRow[],
  nameFor: (account: AccountLike) => string,
): AccountTreeNode[] {
  const nodes = new Map<string, AccountTreeNode>();
  const roots: AccountTreeNode[] = [];

  for (const account of accounts) {
    nodes.set(account.id, {
      id: account.id,
      parentId: account.parentId,
      sortOrder: account.sortOrder,
      name: nameFor(account),
      icon: account.icon ? <span aria-hidden>{account.icon}</span> : undefined,
      children: [],
      account,
    });
  }

  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

interface AccountsTreeProps {
  accounts: AccountRow[];
  canManage: boolean;
  /** Controlled selection (the page owns it: selecting opens the editor). */
  selectedId?: string | null;
  onSelect?: (account: AccountRow) => void;
  onSetBalance: (account: AccountRow) => void;
  onArchiveToggle: (account: AccountRow) => void;
  onDelete: (account: AccountRow) => void;
  onCreateChild: (parent: AccountRow) => void;
  onReorder?: (changes: ReorderChange[]) => void;
}

export function AccountsTree({
  accounts,
  canManage,
  selectedId,
  onSelect,
  onSetBalance,
  onArchiveToggle,
  onDelete,
  onCreateChild,
  onReorder,
}: AccountsTreeProps) {
  const t = useTranslations("Accounts");
  const accountName = useAccountName();
  const treeData = useMemo(
    () => buildAccountTree(accounts, accountName),
    [accounts, accountName],
  );

  const canAdjustBalance = (account: AccountRow) =>
    account.status === "active" &&
    (account.type === "asset" || account.type === "liability");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
      <DraggableTree
        className="min-h-0 flex-1 overflow-auto p-1"
        data={treeData}
        selectedId={selectedId}
        onReorder={canManage ? onReorder : undefined}
        renderNode={(node, props) => (
          <div
            className={cn(
              "group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              props.isSelected &&
                "bg-accent font-medium text-accent-foreground",
              props.isDragging && "opacity-50",
            )}
            style={{ paddingLeft: `${props.level * 16 + 8}px` }}
          >
            {canManage && (
              <button
                type="button"
                className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
                aria-label={t("dragToReorder")}
                {...props.attributes}
                {...props.listeners}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
            {node.icon && <span className="shrink-0">{node.icon}</span>}
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => onSelect?.(node.account)}
            >
              {node.name}
            </button>
            {isBuiltinAccount(node.account.flags) && (
              <Badge variant="outline">{t("builtin")}</Badge>
            )}
            {node.account.status === "archived" && (
              <Badge variant="outline">{t("statuses.archived")}</Badge>
            )}
            {canManage && (
              <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                {node.account.status === "active" && (
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("createChild")}
                    tooltip={t("createChild")}
                    onClick={() => onCreateChild(node.account)}
                  >
                    <Plus />
                  </TooltipButton>
                )}
                {canAdjustBalance(node.account) && (
                  <TooltipButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("setBalance")}
                    tooltip={t("setBalance")}
                    onClick={() => onSetBalance(node.account)}
                  >
                    <Scale />
                  </TooltipButton>
                )}
                {!isBuiltinAccount(node.account.flags) && (
                  <>
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        node.account.status === "active"
                          ? t("archive")
                          : t("unarchive")
                      }
                      tooltip={
                        node.account.status === "active"
                          ? t("archive")
                          : t("unarchive")
                      }
                      onClick={() => onArchiveToggle(node.account)}
                    >
                      {node.account.status === "active" ? (
                        <Archive />
                      ) : (
                        <ArchiveRestore />
                      )}
                    </TooltipButton>
                    <TooltipButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("delete")}
                      tooltip={t("delete")}
                      onClick={() => onDelete(node.account)}
                    >
                      <Trash2 />
                    </TooltipButton>
                  </>
                )}
              </div>
            )}
            {props.expandToggle}
          </div>
        )}
        expandAllLabel={t("expandAll")}
        collapseAllLabel={t("collapseAll")}
        emptyLabel={t("empty")}
      />
    </div>
  );
}
