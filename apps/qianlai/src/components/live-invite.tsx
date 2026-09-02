"use client";

import { TooltipButton } from "@repo/ui";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export interface InviteCodeRow {
  ledgerId: string;
  code: string;
  role: string;
  projectId: string | null;
  expiresAt: string;
  createdAt: string;
}

/** QR payload matching the iOS `InviteCode.payload` scheme, so a scan
 *  recognizes invites minted anywhere. */
function invitePayload(code: string) {
  return `qianlai://join?c=${encodeURIComponent(code)}`;
}

/** Server TTL is 60s; refresh at 50s leaves a buffer for a scan in flight
 *  at the swap. Failed mints retry sooner. */
const REFRESH_MS = 50_000;
const RETRY_MS = 5_000;

/**
 * Self-refreshing invite: mints on mount, keeps the QR alive while
 * mounted (codes expire server-side after a minute), and surfaces the raw
 * code for paste/copy joining. A failed background re-mint keeps the last
 * QR on screen with the error beneath it.
 */
export function LiveInvite({ mint }: { mint: () => Promise<InviteCodeRow> }) {
  const t = useTranslations("Invite");
  const [invite, setInvite] = useState<InviteCodeRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const next = await mint();
        if (cancelled) return;
        setInvite(next);
        setError(null);
        timer = setTimeout(run, REFRESH_MS);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        timer = setTimeout(run, RETRY_MS);
      }
    };
    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mint]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = invite
    ? Math.max(0, Math.ceil((Date.parse(invite.expiresAt) - now) / 1000))
    : null;

  return (
    <div className="flex flex-col items-center gap-3">
      {invite ? (
        <>
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG
              value={invitePayload(invite.code)}
              size={180}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          </div>
          <p className="text-muted-foreground text-sm">{t("scanToJoin")}</p>
          <p className="text-muted-foreground text-xs">
            {t("expiresIn", { seconds: secondsLeft ?? 0 })}
          </p>
          <div className="flex w-full items-start gap-1 rounded-md border px-2 py-1.5">
            <code className="flex-1 font-mono text-[11px] break-all">
              {invite.code}
            </code>
            <TooltipButton
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 shrink-0"
              aria-label={t("copy")}
              tooltip={t("copy")}
              onClick={() => {
                void navigator.clipboard.writeText(invite.code);
                toast.success(t("copied"));
              }}
            >
              <Copy />
            </TooltipButton>
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </>
      ) : (
        <p className="text-muted-foreground py-8 text-sm">
          {error ?? t("minting")}
        </p>
      )}
    </div>
  );
}
