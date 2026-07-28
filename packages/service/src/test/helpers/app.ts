import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { serializeHTTPException } from "#lib/http-error";

type OpenAPIRoute = {
  route: unknown;
  handler: unknown;
};

// Mount a single route on a throwaway app with the standard error handler.
export function mountRoute(route: OpenAPIRoute) {
  const app = new OpenAPIHono();
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(serializeHTTPException(err), err.status as never);
    }
    return c.json({ code: 500, message: "Internal Server Error" }, 500);
  });
  // The openapi() signature is invariant across many route shapes; the cast
  // keeps this helper generic without per-route generics.
  app.openapi(route.route as never, route.handler as never);
  return app;
}

export function jsonRequest(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string } = {},
) {
  return new Request(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init.cookie ? { cookie: init.cookie } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
}
