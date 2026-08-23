import { OpenAPIHono } from "@hono/zod-openapi";
import { createShareCodeRoute } from "./createShareCode";
import { leaveLedgerRoute } from "./leaveLedger";
import { listMembersRoute } from "./listMembers";
import { listShareCodesRoute } from "./listShareCodes";
import { redeemShareCodeRoute } from "./redeemShareCode";
import { removeMemberRoute } from "./removeMember";
import { revokeShareCodeRoute } from "./revokeShareCode";
import { transferOwnershipRoute } from "./transferOwnership";
import { updateMemberRoleRoute } from "./updateMemberRole";

const shareRoutes = new OpenAPIHono();

const routes = shareRoutes.openapiRoutes([
  listMembersRoute,
  removeMemberRoute,
  updateMemberRoleRoute,
  transferOwnershipRoute,
  leaveLedgerRoute,
  listShareCodesRoute,
  createShareCodeRoute,
  revokeShareCodeRoute,
  redeemShareCodeRoute,
] as const);

export { routes as qianlaiShareRoutes };
