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

const LOGO_MAX_SIZE = 2 * 1024 * 1024;

interface ApplicationLogoFormProps {
  appId: string;
  currentLogo?: string | null;
  onSuccess: () => void;
}

export function ApplicationLogoForm({
  appId,
  currentLogo,
  onSuccess,
}: ApplicationLogoFormProps) {
  const t = useTranslations("Applications");
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<ImageCropperRef>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > LOGO_MAX_SIZE) {
      toast.error(t("logoTooLarge"));
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
      { width: 128, height: 128, type: "image/png" },
      "logo.png",
    );
    if (!file) return;

    setUploading(true);
    try {
      const logo = await uploadPublicFile(file);
      await withApiFeedback(appClient.api.applications[":id"].$put)({
        param: { id: appId },
        json: { logo },
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
      <div className="h-20 w-20 shrink-0">
        {currentLogo ? (
          <Image
            src={currentLogo}
            alt={t("logo")}
            width={80}
            height={80}
            className="rounded-lg border object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border bg-muted">
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
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
        </div>
        <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
      </div>

      <Dialog open={cropOpen} onOpenChange={handleCropOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cropLogo")}</DialogTitle>
            <DialogDescription>{t("cropLogoDescription")}</DialogDescription>
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
