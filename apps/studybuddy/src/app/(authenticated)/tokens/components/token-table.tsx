"use client";

import {
  Badge,
  Button,
  ButtonGroup,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, PlayOff, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import { appClient } from "@/lib/api";
import { withApiFeedback } from "@/lib/api/utils";
import { formatDateTime } from "@/utils/date";
import { CreateTokenDialog } from "./create-token-dialog";
import { RevealTokenDialog } from "./reveal-token-dialog";

export interface ApiTokenRow {
  id: string;
  tokenPrefix: string;
  tokenSuffix: string;
  name: string;
  scopes: string[];
  enabled: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export function TokenTable() {
  const t = useTranslations("Tokens");
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [scopesToken, setScopesToken] = useState<ApiTokenRow | null>(null);

  const tokensQuery = useQuery({
    queryKey: ["api-tokens"] as const,
    queryFn: async () => {
      const res = await withApiFeedback(appClient.api["api-tokens"].$get)();
      const data = await res.json();
      return data.tokens as ApiTokenRow[];
    },
  });

  const tokens = tokensQuery.data ?? [];
  const loading = tokensQuery.isFetching;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
  }

  async function handleToggle(token: ApiTokenRow, enabled: boolean) {
    try {
      await withApiFeedback(appClient.api["api-tokens"][":id"].$patch)({
        param: { id: token.id },
        json: { enabled },
      });
      refresh();
      toast.success(enabled ? t("enabled") : t("disabled"));
    } catch {
      // Error handled by API feedback.
    }
  }

  async function handleDelete(token: ApiTokenRow) {
    const confirmed = await confirm({
      title: t("revoke"),
      description: (
        <>
          {t("confirmRevoke")} <strong>{token.name}</strong>?
        </>
      ),
      confirmLabel: t("revoke"),
      cancelLabel: t("cancel"),
    });
    if (!confirmed) return;

    try {
      await withApiFeedback(appClient.api["api-tokens"][":id"].$delete)({
        param: { id: token.id },
      });
      refresh();
      toast.success(t("revoked"));
    } catch {
      // Error handled by API feedback.
    }
  }

  if (loading && tokens.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          {t("create")}
        </Button>
      </div>
      {tokens.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed py-8 text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <Table containerClassName="min-h-0 min-w-0 overflow-auto rounded-md border">
          <TableHeader sticky>
            <TableRow>
              <TableHead>{t("fields.name")}</TableHead>
              <TableHead>{t("fields.token")}</TableHead>
              <TableHead>{t("fields.scopes")}</TableHead>
              <TableHead>{t("fields.status")}</TableHead>
              <TableHead>{t("fields.expires")}</TableHead>
              <TableHead>{t("fields.lastUsed")}</TableHead>
              <TableHead sticky="right" align="right">
                {t("fields.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((token) => (
              <TableRow key={token.id}>
                <TableCell className="font-medium">{token.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {token.tokenPrefix}••••{token.tokenSuffix}
                </TableCell>
                <TableCell>
                  <div className="flex max-w-xs items-center gap-1">
                    {token.scopes.slice(0, 1).map((scope) => (
                      <Badge
                        key={scope}
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {scope}
                      </Badge>
                    ))}
                    {token.scopes.length > 1 && (
                      <Badge
                        variant="outline"
                        className="cursor-pointer font-mono text-[10px] hover:bg-accent"
                        onClick={() => setScopesToken(token)}
                      >
                        <Plus className="size-2.5" />
                        {token.scopes.length - 1}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={token.enabled ? "default" : "secondary"}>
                    {token.enabled ? t("active") : t("inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {token.expiresAt ? formatDateTime(token.expiresAt) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {token.lastUsedAt ? formatDateTime(token.lastUsedAt) : "—"}
                </TableCell>
                <TableCell sticky="right" align="right">
                  <ButtonGroup className="ml-auto">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={
                              token.enabled ? t("disable") : t("enable")
                            }
                            onClick={() => handleToggle(token, !token.enabled)}
                          >
                            {token.enabled ? <PlayOff /> : <Play />}
                          </Button>
                        }
                      />
                      <TooltipContent>
                        {token.enabled ? t("disable") : t("enable")}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("revoke")}
                            onClick={() => handleDelete(token)}
                          >
                            <Trash2 />
                          </Button>
                        }
                      />
                      <TooltipContent>{t("revoke")}</TooltipContent>
                    </Tooltip>
                  </ButtonGroup>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {showCreate && (
        <CreateTokenDialog
          open={showCreate}
          onOpenChange={(open) => !open && setShowCreate(false)}
          onTokenCreated={(token) => {
            setRevealedToken(token);
            refresh();
          }}
        />
      )}

      <RevealTokenDialog
        open={revealedToken !== null}
        onOpenChange={(open) => !open && setRevealedToken(null)}
        token={revealedToken ?? ""}
      />

      <Dialog
        open={scopesToken !== null}
        onOpenChange={(open) => !open && setScopesToken(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("allScopes")}</DialogTitle>
            <DialogDescription>
              {t("allScopesDescription", { name: scopesToken?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-wrap gap-1.5">
              {scopesToken?.scopes.map((scope) => (
                <Badge
                  key={scope}
                  variant="outline"
                  className="font-mono text-[10px]"
                >
                  {scope}
                </Badge>
              ))}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
