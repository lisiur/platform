import { OpenAPIHono } from "@hono/zod-openapi";
import { commitImportRoute } from "./commitImport";
import { exportLedgerRoute } from "./exportLedger";
import { previewImportRoute } from "./previewImport";

const transferRoutes = new OpenAPIHono();

const routes = transferRoutes.openapiRoutes([
  exportLedgerRoute,
  previewImportRoute,
  commitImportRoute,
] as const);

export { routes as qianlaiTransferRoutes };
