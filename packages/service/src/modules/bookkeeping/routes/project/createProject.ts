import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import {
  badRequestResponse,
  createdResponseFn,
  forbiddenResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "#lib/openapi";
import { assertLedgerWritable, requireLedgerAccess } from "../../access";
import { createProject } from "../../project.service";
import {
  createProjectBodySchema,
  ledgerIdParamSchema,
  projectSchema,
} from "./schema";

export const createProjectRoute = defineOpenAPIRoute({
  route: createRoute({
    operationId: "createQianlaiProject",
    method: "post",
    path: "/ledgers/{ledgerId}/projects",
    tags: ["QianlaiProject"],
    summary: "Create a project (editor+)",
    description:
      "Creates a project inside the ledger. The creator becomes its first member — the member list defines the settlement participant set.",
    request: {
      params: ledgerIdParamSchema,
      body: {
        content: {
          "application/json": { schema: createProjectBodySchema },
        },
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...forbiddenResponse,
      ...notFoundResponse,
      ...badRequestResponse,
      ...createdResponseFn(projectSchema, "The created project"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    const { ledgerId } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireLedgerAccess(userId, ledgerId, "editor");
    assertLedgerWritable(access.ledger);
    const project = await createProject(userId, ledgerId, body);
    return c.json(project, 201);
  },
});
