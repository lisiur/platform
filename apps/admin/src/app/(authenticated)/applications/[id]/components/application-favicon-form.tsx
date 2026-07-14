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
  ImageCropper,
  type ImageCropperRef,
} from "@repo/ui";
import { ImagePlus } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { appClient } from "@/lib/api";
import { uploadPublicFile } from "@/lib/api/upload-file";
import { withApiFeedback } from "@/lib/api/utils";

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
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<ImageCropperRef>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > FAVICON_MAX_SIZE) {
      toast.error(t("faviconTooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
  }

  async function handleCropConfirm() {
    const file = await cropperRef.current?.getCroppedFile(
      { width: 48, height: 48, type: "image/png" },
      "favicon.png",
    );
    if (!file) return;

    setUploading(true);
    try {
      const favicon = await uploadPublicFile(file);
      await withApiFeedback(appClient.api.applications[":id"].$put)({
        param: { id: appId },
        json: { favicon },
      });

      setCropOpen(false);
      toast.success(t("updateSuccess"));
      onSuccess();
    } catch {
      // Error handled by client
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleCropOpenChange(open: boolean) {
    setCropOpen(open);
    if (!open) {
      setCropSrc(null);
      cropperRef.current?.reset();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <div className="flex items-center gap-6">
      <div className="h-8 w-8 shrink-0">
        {currentFavicon ? (
          <Image
            src={currentFavicon}
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
          accept="image/*"
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
        </div>
        <p className="text-xs text-muted-foreground">{t("faviconHint")}</p>
      </div>

      <Dialog open={cropOpen} onOpenChange={handleCropOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cropFavicon")}</DialogTitle>
            <DialogDescription>{t("cropFaviconDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {cropSrc && (
              <ImageCropper
                ref={cropperRef}
                src={cropSrc}
                aspect={1}
                keepSelection
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => cropperRef.current?.reset()}
              disabled={uploading}
            >
              {t("resetCrop")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleCropOpenChange(false)}
              disabled={uploading}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCropConfirm}
              disabled={uploading}
            >
              {uploading ? t("uploading") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
