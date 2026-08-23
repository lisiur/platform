"use client";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

interface RevealTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
}

export function RevealTokenDialog({
  open,
  onOpenChange,
  token,
}: RevealTokenDialogProps) {
  const t = useTranslations("Tokens");
  const [copied, setCopied] = useState(false);
  const [copiedExample, setCopiedExample] = useState<string | null>(null);

  function getExampleCode(tab: string): string {
    if (!token) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    switch (tab) {
      case "curl":
        return `curl -H "Authorization: Bearer ${token}" \\
  ${origin}/api/api-tokens/verify`;
      case "nu":
        return `http get -H { Authorization: "Bearer ${token}"] } ${origin}/api/api-tokens/verify`;
      case "js":
        return `fetch(\`${origin}/api/api-tokens/verify\`, {
  headers: { Authorization: \`Bearer ${token}\` }
})`;
      case "python":
        return `requests.get(
    f"${origin}/api/api-tokens/verify",
    headers={"Authorization": f"Bearer ${token}"}
)`;
      default:
        return "";
    }
  }

  async function handleCopy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyExample(tab: string) {
    const code = getExampleCode(tab);
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopiedExample(tab);
    toast.success(t("exampleCopied"));
    setTimeout(() => setCopiedExample(null), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("revealTitle")}</DialogTitle>
          <DialogDescription>{t("revealDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field>
            <FieldLabel>{t("tokenLabel")}</FieldLabel>
            <div className="flex items-center gap-2">
              <Input readOnly value={token} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                aria-label={t("copy")}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <FieldDescription>{t("revealWarning")}</FieldDescription>
          </Field>
          <div className="mt-4">
            <Tabs defaultValue="curl">
              <TabsList>
                <TabsTrigger value="curl">{t("exampleCurl")}</TabsTrigger>
                <TabsTrigger value="nu">{t("exampleNu")}</TabsTrigger>
                <TabsTrigger value="js">{t("exampleJs")}</TabsTrigger>
                <TabsTrigger value="python">{t("examplePython")}</TabsTrigger>
              </TabsList>
              {(["curl", "nu", "js", "python"] as const).map((tab) => (
                <TabsContent key={tab} value={tab} className="relative">
                  <pre className="overflow-x-auto rounded-md bg-muted p-4 pr-12 font-mono text-xs whitespace-pre break-all">
                    {getExampleCode(tab)}
                  </pre>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-0 right-0"
                    onClick={() => handleCopyExample(tab)}
                    aria-label={t("copyExample")}
                  >
                    {copiedExample === tab ? <Check /> : <Copy />}
                  </Button>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
