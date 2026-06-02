import {
  createRoute,
  defineOpenAPIRoute,
  type OpenAPIRoute,
  type RouteConfig,
} from "@hono/zod-openapi";
import type { Env } from "hono";
import type { H } from "hono/types";
import { requirePermission } from "#middleware/require-permission";
import { prepend } from "#utils/list";
import { errorSchema } from "./schema";

interface ProtectedRouteOptions {
  middleware: H;
}

interface PermissionRouteOptions {
  permission: string | { and?: string[]; or?: string[] };
}

const unauthorizedResponse = {
  content: {
    "application/json": { schema: errorSchema },
  },
  description: "Unauthorized",
} as const;

const forbiddenResponse = {
  content: {
    "application/json": { schema: errorSchema },
  },
  description: "Forbidden",
} as const;

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
    middleware: prepend(def.route.middleware, options.middleware),
    responses: {
      401: unauthorizedResponse,
      ...def.route.responses,
    },
  }) as R;

  return defineOpenAPIRoute({ ...def, route });
}

export function definePermissionRoute<
  R extends RouteConfig,
  E extends Env = Env,
  const AddRoute extends boolean | undefined = undefined,
>(
  def: OpenAPIRoute<R, E, AddRoute> & PermissionRouteOptions,
): OpenAPIRoute<R, E, AddRoute> {
  const { permission, ...routeDef } = def;
  const middleware = requirePermission(permission);
  const route = createRoute({
    ...routeDef.route,
    middleware: prepend(routeDef.route.middleware, middleware),
    responses: {
      401: unauthorizedResponse,
      403: forbiddenResponse,
      ...routeDef.route.responses,
    },
  }) as R;

  return defineOpenAPIRoute({ ...routeDef, route });
}
