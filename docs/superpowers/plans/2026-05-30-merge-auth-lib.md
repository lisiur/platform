# Merge lib/auth.ts into services/auth.service.ts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the `lib/auth.ts` facade by flattening `auth.api.getSession` and `auth.api.createUser` into direct exports from `services/auth.service.ts`.

**Architecture:** Inline the two functions from `lib/auth.ts` into `auth.service.ts`, delete the facade file, update `index.ts` exports, and update all 10 import sites to use direct function imports instead of `auth.api.*`.

**Tech Stack:** TypeScript, Hono, Prisma

---

### Task 1: Inline types and getSession into auth.service.ts

**Files:**
- Modify: `packages/service/src/services/auth.service.ts`

- [ ] **Step 1: Add types and update getSession in auth.service.ts**

Add the three type definitions at the top of `auth.service.ts` (after imports, before `signInWithEmail`). Replace the existing `getSession` function (which delegates to `auth.api.getSession`) with the inlined version. Remove the `auth` import.

The file currently starts with:
```ts
import { HTTPException } from "hono/http-exception";
import { auth } from "#lib/auth";
import { prisma } from "#lib/db";
import { hashPassword, verifyPassword } from "#lib/password";
import { createSession, deleteSessionByToken } from "#lib/session";
```

Change to:
```ts
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { hashPassword, verifyPassword } from "#lib/password";
import {
  createSession,
  deleteSessionByToken,
  getSessionByToken,
  getSessionTokenFromHeaders,
} from "#lib/session";

export type AuthSessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
  flags: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type AuthSession = {
  id: string;
  expiresAt: Date;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthType = {
  user: AuthSessionUser | null;
  session: AuthSession | null;
};
```

Replace the existing `getSession` function:
```ts
export async function getSession(headers: Headers) {
  return auth.api.getSession({ headers });
}
```

With:
```ts
export async function getSession(headers: Headers): Promise<AuthType | null> {
  const token = getSessionTokenFromHeaders(headers);
  const result = await getSessionByToken(token);
  if (!result) return null;
  const { user, ...session } = result;
  return { user, session };
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd /Users/lisiur/Projects/101/next101 && pnpm --filter @repo/service exec tsc --noEmit --pretty 2>&1 | head -30`
Expected: Will show errors from other files still importing `#lib/auth` — that's expected and fixed in later tasks.

---

### Task 2: Inline createUser into auth.service.ts

**Files:**
- Modify: `packages/service/src/services/auth.service.ts`

- [ ] **Step 1: Add createUser function**

Add this function after the `getSession` function (before `signInWithEmail`):

```ts
export async function createUser(body: {
  name: string;
  email: string;
  password: string;
  role?: string | null;
}) {
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      emailVerified: false,
      role: body.role ?? "user",
      flags: [],
      accounts: {
        create: {
          accountId: body.email.toLowerCase(),
          providerId: "credential",
          password: await hashPassword(body.password),
        },
      },
    },
  });
  return { user };
}
```

- [ ] **Step 2: Update signUpWithEmail to use createUser directly**

Replace:
```ts
  const { user } = await auth.api.createUser({
    body: {
      name: params.name,
      email,
      password: params.password,
      role: "user",
    },
  });
```

With:
```ts
  const { user } = await createUser({
    name: params.name,
    email,
    password: params.password,
    role: "user",
  });
```

- [ ] **Step 3: Verify file compiles**

Run: `cd /Users/lisiur/Projects/101/next101 && pnpm --filter @repo/service exec tsc --noEmit --pretty 2>&1 | head -30`
Expected: Will still show errors from files importing `#lib/auth`.

---

### Task 3: Update index.ts export

**Files:**
- Modify: `packages/service/src/index.ts`

- [ ] **Step 1: Update the export**

Change:
```ts
export { app } from "./app";
export { type AuthType, auth } from "./lib/auth";
export { prisma } from "./lib/db";
```

To:
```ts
export { app } from "./app";
export { type AuthType } from "./services/auth.service";
export { prisma } from "./lib/db";
```

---

### Task 4: Update route import sites

**Files:**
- Modify: `packages/service/src/routes/upload/signFile.ts`
- Modify: `packages/service/src/routes/upload/uploadFile.ts`
- Modify: `packages/service/src/routes/user-role/getUserAppRoles.ts`
- Modify: `packages/service/src/routes/menu-role/getMine.ts`

- [ ] **Step 1: Update signFile.ts**

Change:
```ts
import { auth } from "#lib/auth";
```
To:
```ts
import { getSession } from "#services/auth.service";
```

Change:
```ts
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
```
To:
```ts
    const session = await getSession(c.req.raw.headers);
```

- [ ] **Step 2: Update uploadFile.ts**

Same pattern — change import and call site:
```ts
import { getSession } from "#services/auth.service";
```
```ts
    const session = await getSession(c.req.raw.headers);
```

- [ ] **Step 3: Update getUserAppRoles.ts**

Same pattern:
```ts
import { getSession } from "#services/auth.service";
```
```ts
    const session = await getSession(c.req.raw.headers);
```

- [ ] **Step 4: Update getMine.ts**

Same pattern:
```ts
import { getSession } from "#services/auth.service";
```
```ts
    const session = await getSession(c.req.raw.headers);
```

---

### Task 5: Update middleware and lib import sites

**Files:**
- Modify: `packages/service/src/middleware/require-admin.ts`
- Modify: `packages/service/src/lib/logger.ts`

- [ ] **Step 1: Update require-admin.ts**

Change:
```ts
import { auth } from "#lib/auth";
```
To:
```ts
import { getSession } from "#services/auth.service";
```

Change:
```ts
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
```
To:
```ts
  const session = await getSession(c.req.raw.headers);
```

- [ ] **Step 2: Update logger.ts**

Change:
```ts
import { auth } from "#lib/auth";
```
To:
```ts
import { getSession } from "#services/auth.service";
```

Change both call sites (lines 81 and 124) from:
```ts
      const session = await auth.api.getSession({
        headers: params.c.req.raw.headers,
      });
```
To:
```ts
      const session = await getSession(params.c.req.raw.headers);
```

---

### Task 6: Update services import sites

**Files:**
- Modify: `packages/service/src/services/user.service.ts`

- [ ] **Step 1: Update user.service.ts**

`user.service.ts` has its own `createUser` function, so alias the import to avoid naming conflict.

Change:
```ts
import { auth } from "#lib/auth";
```
To:
```ts
import { createUser as createAuthUser } from "#services/auth.service";
```

Change:
```ts
  const result = await auth.api
    .createUser({
      body: {
        name,
        email,
        password,
        role: "user",
      },
    })
    .catch(async () => {
```
To:
```ts
  const result = await createAuthUser({
    name,
    email,
    password,
    role: "user",
  }).catch(async () => {
```

---

### Task 7: Update test file

**Files:**
- Modify: `packages/service/src/routes/application/__tests__/application.test.ts`

- [ ] **Step 1: Update mock and imports**

Change the mock from:
```ts
// Mock auth
vi.mock("../../../lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));
```
To:
```ts
// Mock auth
vi.mock("../../../services/auth.service", () => ({
  getSession: vi.fn(),
}));
```

Change:
```ts
import { auth } from "../../../lib/auth";
```
To:
```ts
import { getSession } from "../../../services/auth.service";
```

Change:
```ts
const mockAuth = vi.mocked(auth);
```
To:
```ts
const mockGetSession = vi.mocked(getSession);
```

- [ ] **Step 2: Update all mockAuth.api.getSession references in the test file**

Search for `mockAuth.api.getSession` in the file and replace all occurrences with `mockGetSession`. The pattern changes from:
```ts
mockAuth.api.getSession.mockResolvedValue(...)
```
To:
```ts
mockGetSession.mockResolvedValue(...)
```

---

### Task 8: Delete lib/auth.ts

**Files:**
- Delete: `packages/service/src/lib/auth.ts`

- [ ] **Step 1: Delete the file**

Run: `rm /Users/lisiur/Projects/101/next101/packages/service/src/lib/auth.ts`

---

### Task 9: Verify everything compiles and tests pass

- [ ] **Step 1: Run type check**

Run: `cd /Users/lisiur/Projects/101/next101 && pnpm --filter @repo/service exec tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 2: Run linter**

Run: `cd /Users/lisiur/Projects/101/next101 && pnpm lint`
Expected: No errors

- [ ] **Step 3: Run tests**

Run: `cd /Users/lisiur/Projects/101/next101 && pnpm --filter @repo/service exec vitest --run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/service/src/lib/auth.ts packages/service/src/services/auth.service.ts packages/service/src/index.ts packages/service/src/routes/ packages/service/src/middleware/require-admin.ts packages/service/src/lib/logger.ts packages/service/src/services/user.service.ts
git commit -m "refactor: merge lib/auth.ts into services/auth.service.ts"
```
