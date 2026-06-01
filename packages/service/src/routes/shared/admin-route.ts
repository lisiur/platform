import {
  createRoute,
  defineOpenAPIRoute,
  type OpenAPIRoute,
  type RouteConfig,
} from "@hono/zod-openapi";
import type { Env } from "hono";
import type { H } from "hono/types";
import { requireAdmin } from "#middleware/require-admin";
import { errorSchema } from "./schema";

interface ProtectedRouteOptions {
  middleware: H;
}

const unauthorizedResponse = {
  content: {
    "application/json": { schema: errorSchema },
  },
  description: "Unauthorized",
} as const;

function prependMiddleware(
  protectedMiddleware: H,
  middleware: RouteConfig["middleware"],
): H | H[] {
  if (!middleware) return protectedMiddleware;
  if (Array.isArray(middleware)) return [protectedMiddleware, ...middleware];
  return [protectedMiddleware, middleware];
}

export function defineProtectedRoute<
  R extends RouteConfig,
  E extends Env = Env,
  const AddRoute extends boolean | undefined = undefined,
>(
  def: OpenAPIRoute<R, E, AddRoute>,
  options: ProtectedRouteOptions,
): OpenAPIRoute<R, E, AddRoute> {
  const route = createRoute({
    ...def.route,
    middleware: prependMiddleware(options.middleware, def.route.middleware),
    responses: {
      401: unauthorizedResponse,
      ...def.route.responses,
    },
  }) as R;

  return defineOpenAPIRoute({ ...def, route });
}

export function defineAdminRoute<
  R extends RouteConfig,
  E extends Env = Env,
  const AddRoute extends boolean | undefined = undefined,
>(def: OpenAPIRoute<R, E, AddRoute>): OpenAPIRoute<R, E, AddRoute> {
  return defineProtectedRoute(def, { middleware: requireAdmin });
}
