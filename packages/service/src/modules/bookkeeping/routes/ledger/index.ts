import { OpenAPIHono } from "@hono/zod-openapi";
import { createLedgerRoute } from "./createLedger";
import { deleteLedgerRoute } from "./deleteLedger";
import { listLedgersRoute } from "./listLedgers";
import { setDefaultLedgerRoute } from "./setDefaultLedger";
import { updateLedgerRoute } from "./updateLedger";

const ledgerRoutes = new OpenAPIHono();

const routes = ledgerRoutes.openapiRoutes([
  listLedgersRoute,
  createLedgerRoute,
  updateLedgerRoute,
  deleteLedgerRoute,
  setDefaultLedgerRoute,
] as const);

export { routes as qianlaiLedgerRoutes };
