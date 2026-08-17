import { OpenAPIHono } from "@hono/zod-openapi";
import { createRedeemCode } from "./createRedeemCode";
import { deleteRedeemCode } from "./deleteRedeemCode";
import { getMyCredit } from "./getMyCredit";
import { getMyCreditLedger } from "./getMyCreditLedger";
import { listRedeemCodes } from "./listRedeemCodes";
import { listUserCreditLedger } from "./listUserCreditLedger";
import { listUserCredits } from "./listUserCredits";
import { redeemCode } from "./redeemCode";
import { updateRedeemCode } from "./updateRedeemCode";

const redeemCodeRoutes = new OpenAPIHono();

const routes = redeemCodeRoutes.openapiRoutes([
  listRedeemCodes,
  createRedeemCode,
  updateRedeemCode,
  deleteRedeemCode,
  redeemCode,
  getMyCredit,
  getMyCreditLedger,
  listUserCredits,
  listUserCreditLedger,
] as const);

export { routes as redeemCodeRoutes };
