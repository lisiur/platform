"use client";

import { cn } from "@repo/ui";
import { FileIcon, ImageIcon } from "lucide-react";
import { formatBytes } from "../../lib/format";

export interface UploadedFileCardProps {
  filename: string;
  mimeType: string;
  size: number;
  className?: string;
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) {
    return <ImageIcon className="size-5 shrink-0" />;
  }
  return <FileIcon className="size-5 shrink-0" />;
}

export function UploadedFileCard({
  filename,
  mimeType,
  size,
  className,
}: UploadedFileCardProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg border border-border bg-background/60 px-4 py-3 text-sm",
        className,
      )}
    >
      <FileTypeIcon mimeType={mimeType} />
      <div className="flex flex-col">
        <span className="max-w-[200px] truncate font-medium">{filename}</span>
        <span className="text-xs text-muted-foreground">
          {formatBytes(size)}
        </span>
      </div>
    </div>
  );
}
