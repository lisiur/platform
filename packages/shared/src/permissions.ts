import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const statement = {
  ...defaultStatements,
  project: ["create", "read", "update", "delete"],
  config: ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

export const admin = ac.newRole({
  ...adminAc.statements,
  project: ["create", "read", "update", "delete"],
  config: ["read", "update"],
});

export const user = ac.newRole({
  user: [],
  session: [],
  project: ["read"],
  config: ["read"],
});
