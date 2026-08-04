import { type ToolSet, tool } from "ai";
import { z } from "zod";
import { resolveAgentFile } from "#lib/ai-agent/agent-file-store";
import type { CallApiContext } from "./call-api";

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml"];
const MAX_TEXT_READ_BYTES = 50_000;

function isTextMime(type: string): boolean {
  return TEXT_MIME_PREFIXES.some((p) => type.startsWith(p));
}

export function makeReadFileTool(ctx: CallApiContext): ToolSet[string] {
  return tool({
    description:
      "Read an uploaded file from the current agent session. Use this to " +
      "inspect files the user has attached. Returns the text content for " +
      "text files, or metadata and size for binary files. The fileId can " +
      "be found in <uploaded-file> tags in the conversation.",
    inputSchema: z.object({
      fileId: z
        .string()
        .describe("The fileId from an <uploaded-file> tag in the conversation"),
    }),
    execute: async (input) => {
      const { fileId } = input as { fileId: string };

      const file = await resolveAgentFile(ctx.sessionId, fileId);
      if (!file) {
        return {
          ok: false,
          error: `File "${fileId}" not found in this session. Use the fileId from an <uploaded-file> tag.`,
        };
      }

      const meta = {
        fileId,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      };

      if (!isTextMime(file.type)) {
        return {
          ok: true,
          ...meta,
          content: null,
          note: "Binary file — content cannot be displayed as text. Use the fileId with call_api for multipart uploads.",
        };
      }

      if (file.size > MAX_TEXT_READ_BYTES) {
        return {
          ok: true,
          ...meta,
          content: null,
          note: `File too large for inline reading (${file.size} > ${MAX_TEXT_READ_BYTES} bytes). Use the fileId with call_api for multipart uploads.`,
        };
      }

      try {
        const content = await file.text();
        return { ok: true, ...meta, content };
      } catch {
        return {
          ok: false,
          error: `Failed to read file "${file.name}" as text`,
        };
      }
    },
  }) satisfies ToolSet[string];
}
