"use client";

import { Button } from "@repo/ui";
import { ImagePlus } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { uploadPublicFile } from "@/lib/api/upload-file";
import { withApiFeedback } from "@/lib/api/utils";

const FAVICON_ACCEPT =
  ".ico,image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml,image/gif,image/webp";
const FAVICON_MAX_SIZE = 2 * 1024 * 1024;

interface ApplicationFaviconFormProps {
  appId: string;
  currentFavicon?: string | null;
  onSuccess: () => void;
}

export function ApplicationFaviconForm({
  appId,
  currentFavicon,
  onSuccess,
}: ApplicationFaviconFormProps) {
  const t = useTranslations("Applications");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const displayImage = preview ?? currentFavicon;

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > FAVICON_MAX_SIZE) {
      toast.error(t("faviconTooLarge"));
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPreview(url);
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const favicon = await uploadPublicFile(file);
      await withApiFeedback(appClient.api.applications[":id"].$put)({
        param: { id: appId },
        json: { favicon },
      });

      clearPreview();
      toast.success(t("updateSuccess"));
      onSuccess();
    } catch {
      // Error handled by client
    } finally {
      setUploading(false);
    }
  }

  function clearPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-6">
      <div className="h-8 w-8 shrink-0">
        {displayImage ? (
          <Image
            src={displayImage}
            alt={t("favicon")}
            width={32}
            height={32}
            className="rounded border object-contain"
            unoptimized
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded border bg-muted">
            <ImagePlus className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={FAVICON_ACCEPT}
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
                onClick={clearPreview}
                disabled={uploading}
              >
                {t("cancel")}
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("faviconHint")}</p>
      </div>
    </div>
  );
}
