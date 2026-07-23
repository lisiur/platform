import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

const ERROR_MESSAGE = "Payload Too Large";

type BodyLimitOptions = {
  maxSize: number;
  onError?: (c: Context) => Response | Promise<Response>;
};

export function bodyLimit(options: BodyLimitOptions) {
  const { maxSize } = options;
  const onError =
    options.onError ||
    (() => {
      const res = new Response(ERROR_MESSAGE, { status: 413 });
      throw new HTTPException(413, { res });
    });

  return createMiddleware(async (c, next) => {
    const raw = c.req.raw;

    if (!raw.body) {
      return next();
    }

    const hasTransferEncoding = raw.headers.has("transfer-encoding");
    const hasContentLength = raw.headers.has("content-length");

    if (hasContentLength && !hasTransferEncoding) {
      const contentLength = parseInt(
        raw.headers.get("content-length") || "0",
        10,
      );
      if (contentLength > maxSize) {
        return onError(c);
      }
      return next();
    }

    let size = 0;
    const chunks: Uint8Array[] = [];
    const reader = raw.body.getReader();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      size += value.length;
      if (size > maxSize) {
        await reader.cancel();
        return onError(c);
      }
      chunks.push(value);
    }

    const body = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    const headers = new Headers(Array.from(raw.headers.entries()));
    const newRequestInit: RequestInit & { duplex?: "half" } = {
      method: raw.method,
      headers,
      body,
      duplex: "half",
    };
    const newRequest = new Request(raw.url, newRequestInit);

    c.req.raw = newRequest;
    return next();
  });
}
