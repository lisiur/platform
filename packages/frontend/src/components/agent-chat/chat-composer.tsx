"use client";

import { Button } from "@repo/ui";
import { Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ChatComposerProps {
  status: "submitted" | "streaming" | "ready" | "error";
  onSend: (text: string) => void;
  onStop: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatComposer({
  status,
  onSend,
  onStop,
  placeholder,
  disabled,
}: ChatComposerProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const text = input.trim();
    if (!text || busy || disabled) return;
    onSend(text);
    setInput("");
  }

  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-border p-3">
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
        rows={1}
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
        >
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={!input.trim() || disabled}
          title="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
