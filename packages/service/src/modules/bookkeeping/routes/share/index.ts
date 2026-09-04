import { OpenAPIHono } from "@hono/zod-openapi";
import { createShareCodeRoute } from "./createShareCode";
import { createVirtualMemberRoute } from "./createVirtualMember";
import { leaveLedgerRoute } from "./leaveLedger";
import { listMembersRoute } from "./listMembers";
import { redeemShareCodeRoute } from "./redeemShareCode";
import { removeMemberRoute } from "./removeMember";
import { transferOwnershipRoute } from "./transferOwnership";
import { updateMemberRoute } from "./updateMember";

const shareRoutes = new OpenAPIHono();

const routes = shareRoutes.openapiRoutes([
  listMembersRoute,
  createVirtualMemberRoute,
  removeMemberRoute,
  updateMemberRoute,
  transferOwnershipRoute,
  leaveLedgerRoute,
  createShareCodeRoute,
  redeemShareCodeRoute,
] as const);

export { routes as qianlaiShareRoutes };
