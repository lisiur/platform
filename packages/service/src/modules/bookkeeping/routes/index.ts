import { OpenAPIHono } from "@hono/zod-openapi";
import { qianlaiAccountRoutes } from "./account";
import { qianlaiJournalEntryRoutes } from "./journal-entry";
import { qianlaiLedgerRoutes } from "./ledger";
import { qianlaiRealAccountRoutes } from "./real-account";
import { qianlaiReportRoutes } from "./report";
import { qianlaiShareRoutes } from "./share";

const bookkeepingRoutes = new OpenAPIHono()
  .route("/", qianlaiLedgerRoutes)
  .route("/", qianlaiAccountRoutes)
  .route("/", qianlaiRealAccountRoutes)
  .route("/", qianlaiJournalEntryRoutes)
  .route("/", qianlaiReportRoutes)
  .route("/", qianlaiShareRoutes);

export { bookkeepingRoutes };
