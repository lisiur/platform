"use client";

import { Button, cn } from "@repo/ui";
import { FileIcon, Paperclip, Send, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes } from "../../lib/format";

interface ChatComposerProps {
  status: "submitted" | "streaming" | "ready" | "error";
  onSend: (text: string, files: File[]) => void | Promise<void>;
  onStop: () => void;
  placeholder?: string;
  disabled?: boolean;
}

interface StagedFile {
  id: number;
  file: File;
}

export function ChatComposer({
  status,
  onSend,
  onStop,
  placeholder,
  disabled,
}: ChatComposerProps) {
  const [input, setInput] = useState("");
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextFileId = useRef(0);
  const sendingRef = useRef(false);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addFiles = useCallback((files: File[]) => {
    setStagedFiles((prev) => [
      ...prev,
      ...files.map((file) => ({ id: nextFileId.current++, file })),
    ]);
  }, []);

  const removeFile = useCallback((id: number) => {
    setStagedFiles((prev) => prev.filter((s) => s.id !== id));
  }, []);

  async function submit() {
    if (sendingRef.current) return;
    const text = input.trim();
    if ((!text && stagedFiles.length === 0) || busy || disabled) return;
    const files = stagedFiles.map((s) => s.file);
    const prevInput = input;
    const prevFiles = stagedFiles;
    sendingRef.current = true;
    setInput("");
    setStagedFiles([]);
    try {
      await onSend(text, files);
    } catch {
      setInput(prevInput);
      setStagedFiles(prevFiles);
    } finally {
      sendingRef.current = false;
    }
  }

  const rows = Math.min(Math.max(input.split("\n").length, 1), 6);
  const canSend =
    (input.trim().length > 0 || stagedFiles.length > 0) && !disabled;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-drop zone has no corresponding ARIA role
    <div
      className={cn(
        "shrink-0 border-t border-border p-3",
        dragging && "bg-accent/50",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) addFiles(files);
      }}
    >
      {stagedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {stagedFiles.map((s) => (
            <span
              key={s.id}
              className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs"
            >
              <FileIcon className="size-3 shrink-0 text-muted-foreground" />
              <span className="max-w-[160px] truncate">{s.file.name}</span>
              <span className="text-muted-foreground">
                {formatBytes(s.file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(s.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files) addFiles(Array.from(files));
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Attach file"
          className="shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={rows}
          placeholder={
            placeholder ??
            "Message the agent…  (Enter to send, Shift+Enter for newline)"
          }
          disabled={disabled}
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />

        {busy ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onStop}
            title="Stop"
            className="shrink-0"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={submit}
            disabled={!canSend}
            title="Send"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
