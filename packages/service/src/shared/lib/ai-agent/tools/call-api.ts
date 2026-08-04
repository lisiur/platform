import { type ToolSet, tool } from "ai";
import { z } from "zod";
import { resolveAgentFile } from "#lib/ai-agent/agent-file-store";
import {
  findOperation,
  getBinaryFieldNames,
  isMultipartOperation,
} from "#modules/agent/openapi.service";

export type ForwardedHeaders = Record<string, string>;

export type CallApiContext = {
  apiOrigin: string;
  sessionId: string;
  forwardedHeaders: ForwardedHeaders;
  allowedOperationIds: Set<string>;
};

// Headers forwarded from the user's original request to agent-initiated API
// calls. Kept intentionally minimal to avoid leaking internal or
// environment-specific headers. Auth schemes relying on custom headers (e.g.
// X-API-Key) are not forwarded — the agent inherits the caller's session via
// cookie/authorization only.
const FORWARD_HEADER_NAMES = [
  "cookie",
  "authorization",
  "x-app-code",
  "traceparent",
];

function buildForwardedHeaders(
  forwardedHeaders: ForwardedHeaders,
): ForwardedHeaders {
  const fwd: ForwardedHeaders = {};
  for (const name of FORWARD_HEADER_NAMES) {
    const v = forwardedHeaders[name];
    if (v) fwd[name] = v;
  }
  return fwd;
}

async function executeApiCall(
  origin: string,
  method: string,
  path: string,
  fwdHeaders: ForwardedHeaders,
  pathParams: Record<string, string>,
  queryParams: Record<string, string>,
  body?: unknown,
) {
  const httpMethod = method.toLowerCase();

  let urlPath = path;
  const pathParamNames = new Set(
    (path.match(/\{([^}]+)\}/g) ?? []).map((t) => t.slice(1, -1)),
  );
  for (const [k, v] of Object.entries(pathParams)) {
    if (pathParamNames.has(k)) {
      urlPath = urlPath.replace(`{${k}}`, encodeURIComponent(v));
    }
  }

  const qs = Object.entries(queryParams)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const url = `${origin.replace(/\/$/, "")}${urlPath}${qs ? `?${qs}` : ""}`;

  const init: RequestInit = {
    method,
    headers: {
      accept: "application/json",
      "user-agent": "platform-agent/1.0",
      "x-internal-token": process.env.AGENT_API_TOKEN ?? "",
      ...fwdHeaders,
    },
  };

  if (body !== undefined && httpMethod !== "get" && httpMethod !== "head") {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers = {
        ...init.headers,
        "content-type": "application/json",
      };
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
  }

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let parsed: unknown = text;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep raw text
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        statusText: res.statusText,
        error: parsed,
      };
    }
    return { ok: true, status: res.status, data: parsed };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      statusText: "Network Error",
      error: String(err),
    };
  }
}

export function makeCallApiTool(ctx: CallApiContext): ToolSet[string] {
  return tool({
    description:
      "Call a platform REST API endpoint. Use `get_api_schema` first to " +
      "inspect an endpoint's parameters and body structure, then call this " +
      "tool with the correct arguments. For multipart/file-upload endpoints, " +
      "binary body fields accept a fileId from the upload file endpoint.",
    inputSchema: z.object({
      operationId: z
        .string()
        .describe("The operationId from the available operations catalogue"),
      pathParams: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Path parameters to substitute into the URL, e.g. { id: 'abc-123' }",
        ),
      queryParams: z
        .record(z.string(), z.string())
        .optional()
        .describe("Query string parameters, e.g. { page: '1', limit: '20' }"),
      body: z
        .any()
        .optional()
        .describe(
          "Request body. For JSON endpoints, pass an object. For " +
            "file-upload (multipart) endpoints, pass an object where binary " +
            "fields are fileIds from the upload file endpoint.",
        ),
    }),
    execute: async (input) => {
      const {
        operationId,
        pathParams = {},
        queryParams = {},
        body,
      } = input as {
        operationId: string;
        pathParams?: Record<string, string>;
        queryParams?: Record<string, string>;
        body?: unknown;
      };

      if (!ctx.allowedOperationIds.has(operationId)) {
        return {
          ok: false,
          status: 400,
          statusText: "Unknown operationId",
          error: `"${operationId}" is not in the available operations catalogue. Check the list and try again.`,
        };
      }

      const found = await findOperation(operationId);
      if (!found) {
        return {
          ok: false,
          status: 400,
          statusText: "Unknown operationId",
          error: `Operation "${operationId}" not found in the current OpenAPI spec`,
        };
      }

      let resolvedBody: unknown = body;

      if (
        body !== undefined &&
        body !== null &&
        typeof body === "object" &&
        isMultipartOperation(found.raw)
      ) {
        const binaryFields = getBinaryFieldNames(found.raw);
        const fd = new FormData();
        for (const [key, value] of Object.entries(
          body as Record<string, unknown>,
        )) {
          if (binaryFields.has(key) && typeof value === "string") {
            const file = await resolveAgentFile(ctx.sessionId, value);
            if (!file) {
              return {
                ok: false,
                status: 400,
                statusText: "File not found",
                error: `File not found for field "${key}": fileId "${value}" does not exist in this session. Upload the file first.`,
              };
            }
            fd.append(key, file);
          } else {
            fd.append(key, String(value));
          }
        }
        resolvedBody = fd;
      }

      return executeApiCall(
        ctx.apiOrigin,
        found.method,
        found.path,
        buildForwardedHeaders(ctx.forwardedHeaders),
        pathParams,
        queryParams,
        resolvedBody,
      );
    },
  }) satisfies ToolSet[string];
}
