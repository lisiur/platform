import { OpenAPIHono } from "@hono/zod-openapi";
import { qianlaiAccountRoutes } from "./account";
import { qianlaiJournalEntryRoutes } from "./journal-entry";
import { qianlaiLedgerRoutes } from "./ledger";
import { qianlaiReportRoutes } from "./report";
import { qianlaiShareRoutes } from "./share";

const bookkeepingRoutes = new OpenAPIHono()
  .route("/", qianlaiLedgerRoutes)
  .route("/", qianlaiAccountRoutes)
  .route("/", qianlaiJournalEntryRoutes)
  .route("/", qianlaiReportRoutes)
  .route("/", qianlaiShareRoutes);

export { bookkeepingRoutes };
