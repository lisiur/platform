import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LogDetailDialogProps {
  open: boolean;
  title: string;
  description?: string;
  traceId?: string | null;
  data: unknown;
  onOpenChange: (open: boolean) => void;
}

export function LogDetailDialog({
  open,
  title,
  description,
  traceId,
  data,
  onOpenChange,
}: LogDetailDialogProps) {
  const t = useTranslations("Logs");

  async function copyTraceId() {
    if (!traceId) return;
    await navigator.clipboard.writeText(traceId);
    toast.success(t("traceCopied"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {traceId && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
            <span className="text-muted-foreground text-sm">
              {t("columns.traceId")}
            </span>
            <code className="rounded bg-background px-2 py-1 font-mono text-xs">
              {traceId}
            </code>
            <Button variant="ghost" size="sm" onClick={copyTraceId}>
              <Copy className="mr-1 h-3 w-3" />
              {t("copy")}
            </Button>
          </div>
        )}
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-sm">
          {JSON.stringify(data, null, 2)}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
