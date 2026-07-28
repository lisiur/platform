import { z } from "@hono/zod-openapi";
import { ROLE_CODE_REGEX, SCOPE_PREFIX_REGEX } from "#lib/scope";

export { errorSchema, successSchema } from "#lib/openapi";

export const roleSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    name: z.string().openapi({ example: "Administrator" }),
    code: z.string().openapi({ example: "system/admin" }),
    flags: z.array(z.string()).openapi({ example: ["builtin"] }),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("Role");

export const listRolesQuerySchema = z.object({
  scopePrefix: z
    .string()
    .min(1)
    .regex(
      SCOPE_PREFIX_REGEX,
      "scopePrefix must be 'system' or 'org:<organizationId>'",
    ),
});

export const createRoleBodySchema = z.object({
  name: z.string().min(1),
  code: z
    .string()
    .min(1)
    .regex(
      ROLE_CODE_REGEX,
      "code must be '<scope>/<roleName>' where scope is 'system' or 'org:<organizationId>'",
    ),
});

export const updateRoleBodySchema = z.object({
  name: z.string().min(1).optional(),
  code: z
    .string()
    .min(1)
    .regex(
      ROLE_CODE_REGEX,
      "code must be '<scope>/<roleName>' where scope is 'system' or 'org:<organizationId>'",
    )
    .optional(),
});

export const roleIdParamSchema = z.object({
  id: z.string().min(1),
});
