"use client";

import { Button } from "@repo/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { appClient, withApiFeedback } from "@/lib/api";

interface OrgLogoUploadProps {
  organizationId: string;
  currentLogo?: string | null;
  name: string;
  onLogoUpdate: (url: string) => void;
}

export function OrgLogoUpload({
  organizationId,
  currentLogo,
  name,
  onLogoUpdate,
}: OrgLogoUploadProps) {
  const t = useTranslations("Settings");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayLogo = preview ?? currentLogo;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("fileTooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const res = await withApiFeedback(appClient.api.upload.$post)({
        form: { file, visibility: "public" },
      });
      const data = await res.json();
      const logoUrl = data.url;

      await withApiFeedback(appClient.api.organizations[":id"].settings.$put)({
        param: { id: organizationId },
        json: { logo: logoUrl },
      });

      onLogoUpdate(logoUrl);
      setPreview(null);
      toast.success(t("logoUpdated"));
    } catch {
      // Error handled by withApiFeedback
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleCancel() {
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
        {displayLogo ? (
          <Image
            src={displayLogo}
            alt="Logo"
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-medium text-muted-foreground">
            {initials}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {t("chooseFile")}
          </Button>
          {preview && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? t("uploading") : t("save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={uploading}
              >
                {t("cancel")}
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
      </div>
    </div>
  );
}
