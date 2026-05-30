# Remove Better Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `better-auth` and replace the auth behavior this app actually uses with a small app-owned Hono/Prisma implementation.

**Architecture:** Auth becomes part of `@repo/service`: Prisma owns users, Argon2id password hashes, sessions, cookies, and `/api/auth/*` endpoints. The admin app keeps a small `authClient` facade so most UI forms keep their current call sites, while the backend preserves `auth.api.getSession({ headers })` for middleware, logging, upload, menu, and tests.

**Tech Stack:** Hono, `@hono/zod-openapi`, Prisma 7, PostgreSQL, Argon2id via `argon2`, Next.js 16 admin app, React 19, pnpm, Vitest, Biome.

---

## Decisions And Non-Goals

- Existing auth data does not need migration. Existing users, passwords, sessions, better-auth cookies, OAuth account data, verification rows, member rows, and invitation rows can be reset or reseeded.
- Passwords use Argon2id only. Do not implement better-auth scrypt compatibility.
- Do not reimplement better-auth social providers, organization plugin APIs, admin plugin APIs, verification APIs, impersonation, ban APIs, or OpenAPI auth schema generation.
- Keep current product behavior only: email/password sign-in, sign-up, sign-out, session lookup, profile update, password change, admin-created users, admin password reset, and role-based admin guarding.
- Use a new cookie name: `next101.session_token`.
- Keep `Account`, `Verification`, `Member`, and `Invitation` in Prisma for now, even though the minimal auth replacement will not actively use their better-auth plugin behavior.

## File Structure

- Modify `packages/service/package.json`: add `argon2`, remove `better-auth`.
- Modify `apps/admin/package.json`: remove `better-auth`.
- Modify `packages/shared/package.json`: remove unused `better-auth` dependency.
- Modify `packages/service/prisma/schema.prisma`: keep current auth-related models and table layout.
- Modify `packages/service/prisma/seed.ts`: hash seeded passwords with the local Argon2 helper and write the credential password hash to `Account.password`.
- Create `packages/service/src/lib/password.ts`: Argon2id hash/verify functions.
- Create `packages/service/src/lib/session.ts`: session token generation, cookie read/write/delete, session create/read/delete helpers.
- Replace `packages/service/src/lib/auth.ts`: app-owned `auth.api.getSession` and `auth.api.createUser` compatibility facade.
- Replace `packages/service/src/routes/auth.routes.ts`: make it a compatibility re-export from `routes/auth`.
- Create `packages/service/src/routes/auth/schema.ts`: OpenAPI/Zod schemas for auth endpoints.
- Create `packages/service/src/routes/auth/signInEmail.ts`: POST `/sign-in/email`.
- Create `packages/service/src/routes/auth/signUpEmail.ts`: POST `/sign-up/email`.
- Create `packages/service/src/routes/auth/signOut.ts`: POST `/sign-out`.
- Create `packages/service/src/routes/auth/getSession.ts`: GET `/get-session`.
- Create `packages/service/src/routes/auth/updateUser.ts`: POST `/update-user`.
- Create `packages/service/src/routes/auth/changePassword.ts`: POST `/change-password`.
- Create `packages/service/src/routes/auth/index.ts`: route aggregation through `openapiRoutes([...])`.
- Modify `packages/service/src/app.ts`: remove Scalar source `/api/auth/open-api/generate-schema`.
- Modify `packages/service/src/routes/admin-user/createUser.ts`: create users directly through `auth.api.createUser` backed by Prisma and Argon2.
- Modify `packages/service/src/routes/admin-user/updateUser.ts`: update the credential account password with Argon2.
- Modify `packages/service/src/routes/upload/signFile.ts`: remove `BETTER_AUTH_SECRET` fallback; require/use `UPLOAD_SIGN_SECRET` fallback only.
- Replace `apps/admin/src/lib/api/auth-client.ts`: local client facade plus `useSession` hook.
- Modify `apps/admin/src/components/layout/sidebar.tsx`: remove `better-auth/react` and use local `useSession`.
- Modify `apps/admin/src/app/page.tsx`: remove `better-auth/react` and use local `useSession`.
- Modify `apps/admin/src/hooks/use-current-app.ts`: remove `better-auth/react` and use local `useSession`.
- Leave existing form call sites mostly intact: `authClient.signIn.email`, `authClient.signUp.email`, `authClient.signOut`, `authClient.getSession`, `authClient.updateUser`, and `authClient.changePassword` remain available.

## Task 1: Dependencies And Prisma Schema

**Files:**
- Modify: `packages/service/package.json`
- Modify: `apps/admin/package.json`
- Modify: `packages/shared/package.json`
- Modify: `packages/service/prisma/schema.prisma`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Update dependencies**

Run:

```bash
pnpm --filter @repo/service add argon2
pnpm --filter @repo/service remove better-auth
pnpm --filter @apps/admin remove better-auth
pnpm --filter @repo/shared remove better-auth
```

Expected: `packages/service/package.json` contains `"argon2"`, and no package `package.json` contains `"better-auth"`.

- [ ] **Step 2: Keep the Prisma auth schema models**

Keep the current auth-related models in `packages/service/prisma/schema.prisma`. Do not delete `Account`, `Verification`, `Member`, or `Invitation`, and do not add `User.passwordHash`. The owned password implementation stores Argon2 hashes in `Account.password` for `providerId: "credential"`.

The auth-related schema should continue to include these model relationships:

```prisma
model User {
  id            String     @id @default(cuid())
  name          String
  email         String
  emailVerified Boolean    @default(false)
  image         String?
  role          String?
  banned        Boolean?   @default(false)
  banReason     String?
  banExpires    DateTime?
  flags         String[]   @default([])
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
  sessions      Session[]
  accounts      Account[]
  members       Member[]
  invitations   Invitation[]
  uploads       Upload[]
  userRoles     UserRole[]

  @@unique([email])
  @@map("user")
}

model Session {
  id                   String   @id @default(cuid())
  expiresAt            DateTime
  token                String
  ipAddress            String?
  userAgent            String?
  userId               String
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  impersonatedBy       String?
  activeOrganizationId String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@unique([token])
  @@index([userId])
  @@map("session")
}

model Account {
  id                    String    @id @default(cuid())
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@index([userId])
  @@map("account")
}

model Verification {
  id         String   @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verification")
}

model Organization {
  id          String       @id @default(cuid())
  name        String
  slug        String
  logo        String?
  metadata    String?
  createdAt   DateTime
  members     Member[]
  invitations Invitation[]

  @@unique([slug])
  @@map("organization")
}

model Member {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  userId         String
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           String       @default("member")
  createdAt      DateTime

  @@index([organizationId])
  @@index([userId])
  @@map("member")
}

model Invitation {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  email          String
  role           String?
  status         String       @default("pending")
  expiresAt      DateTime
  inviterId      String
  createdAt      DateTime     @default(now())
  user           User         @relation(fields: [inviterId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([email])
  @@map("invitation")
}
```

- [ ] **Step 3: Confirm Prisma migration scope**

Because the schema keeps the existing auth models, there may be no Prisma schema migration for this task. If Prisma detects no schema changes, continue to generation.

Run:

```bash
pnpm db:migrate
pnpm db:generate
```

Expected: Prisma either reports no migration is needed or creates only intentional non-destructive changes, then regenerates the service Prisma client.

- [ ] **Step 4: Commit this task if committing is requested by the user**

Only commit if the user explicitly asked for commits.

```bash
git status --short
git diff -- packages/service/package.json apps/admin/package.json packages/shared/package.json packages/service/prisma/schema.prisma pnpm-lock.yaml
```

Expected: only intended dependency and schema changes are present.

## Task 2: Argon2 Password Helper

**Files:**
- Create: `packages/service/src/lib/password.ts`
- Modify: `packages/service/prisma/seed.ts`
- Modify: `packages/service/src/routes/admin-user/updateUser.ts`

- [ ] **Step 1: Create the password helper**

Create `packages/service/src/lib/password.ts`:

```ts
import { hash, verify } from "argon2";

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string) {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string) {
  return verify(hashValue, password);
}
```

- [ ] **Step 2: Update admin password reset import**

In `packages/service/src/routes/admin-user/updateUser.ts`, replace:

```ts
import { hashPassword } from "better-auth/crypto";
```

with:

```ts
import { hashPassword } from "#lib/password";
```

Keep password writes in the credential account table. Replace the current better-auth hash call with the local Argon2 hash while preserving the existing account upsert behavior:

```ts
if (password) {
  const hashedPassword = await hashPassword(password);
  const existingAccount = await prisma.account.findFirst({
    where: { userId: id, providerId: "credential" },
  });
  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { password: hashedPassword },
    });
  } else {
    await prisma.account.create({
      data: {
        accountId: id,
        providerId: "credential",
        userId: id,
        password: hashedPassword,
      },
    });
  }
}
```

- [ ] **Step 3: Update seed password hashing**

In `packages/service/prisma/seed.ts`, replace:

```ts
import { hashPassword } from "better-auth/crypto";
```

with a relative import that works from the Prisma seed file:

```ts
import { hashPassword } from "../src/lib/password";
```

Where the seed currently creates a `User` and an `Account`, keep that structure and write the Argon2 hash to `Account.password`:

```ts
const hashedPassword = await hashPassword(params.password);

const user = await prisma.user.upsert({
  where: { email: params.email },
  update: {
    name: params.name,
    role: params.role,
    flags: params.flags ?? [],
  },
  create: {
    name: params.name,
    email: params.email,
    emailVerified: true,
    role: params.role,
    flags: params.flags ?? [],
  },
});

await prisma.account.upsert({
  where: {
    id: `credential:${user.id}`,
  },
  update: {
    password: hashedPassword,
  },
  create: {
    id: `credential:${user.id}`,
    accountId: user.id,
    providerId: "credential",
    userId: user.id,
    password: hashedPassword,
  },
});
```

If the seed assigns `UserRole` rows after creating the user, preserve that logic and use the returned `user.id` from the upsert.

- [ ] **Step 4: Verify no old hash imports remain**

Run:

```bash
rg "better-auth/crypto" packages/service --glob '!prisma/generated/**'
```

Expected: no matches for active source files.

## Task 3: Session Helper

**Files:**
- Create: `packages/service/src/lib/session.ts`

- [ ] **Step 1: Create session helper**

Create `packages/service/src/lib/session.ts`:

```ts
import { randomBytes } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { prisma } from "#lib/db";
import { logAudit } from "#lib/logger";

export const SESSION_COOKIE_NAME = "next101.session_token";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_REFRESH_AFTER_MS = 60 * 60 * 24 * 1000;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function getSessionTokenFromHeaders(headers: Headers) {
  const cookie = headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function deleteSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}

export function getSessionTokenFromContext(c: Context) {
  return getCookie(c, SESSION_COOKIE_NAME) ?? null;
}

export async function createSession(params: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      token,
      userId: params.userId,
      expiresAt,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });

  await logAudit({
    userId: session.userId,
    sessionId: session.id,
    event: "auth.login",
    category: "authentication",
    targetType: "session",
    targetId: session.id,
    metadata: {
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    },
  });

  return session;
}

export async function getSessionByToken(token: string | null) {
  if (!token) return null;

  const result = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!result) return null;

  if (result.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: result.id } }).catch(() => null);
    return null;
  }

  if (Date.now() - result.updatedAt.getTime() >= SESSION_REFRESH_AFTER_MS) {
    return prisma.session.update({
      where: { id: result.id },
      data: { expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000) },
      include: { user: true },
    });
  }

  return result;
}

export async function deleteSessionByToken(token: string | null) {
  if (!token) return null;

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) return null;

  await prisma.session.delete({ where: { id: session.id } });
  await logAudit({
    userId: session.userId,
    sessionId: session.id,
    event: "auth.logout",
    category: "authentication",
    targetType: "session",
    targetId: session.id,
  });

  return session;
}
```

- [ ] **Step 2: Run typecheck through build after later tasks**

Do not run build yet if route files still import removed `better-auth` symbols. This helper will compile once Task 4 replaces `auth.ts`.

## Task 4: Auth Facade

**Files:**
- Replace: `packages/service/src/lib/auth.ts`

- [ ] **Step 1: Replace better-auth with app-owned auth facade**

Replace `packages/service/src/lib/auth.ts` with:

```ts
import { prisma } from "#lib/db";
import { hashPassword } from "#lib/password";
import { getSessionByToken, getSessionTokenFromHeaders } from "#lib/session";

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

export const auth = {
  api: {
    async getSession({ headers }: { headers: Headers }): Promise<AuthType | null> {
      const token = getSessionTokenFromHeaders(headers);
      const result = await getSessionByToken(token);
      if (!result) return null;

      const { user, ...session } = result;
      return { user, session };
    },

    async createUser({
      body,
    }: {
      body: {
        name: string;
        email: string;
        password: string;
        role?: string | null;
      };
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
    },
  },
};
```

- [ ] **Step 2: Verify backend callers can keep their current shape**

Run:

```bash
rg "auth\.api\.getSession|auth\.api\.createUser" packages/service/src
```

Expected: callers in middleware, logger, menu-role, user-role, upload, and admin-user still use the preserved facade shape.

## Task 5: Auth Route Schemas

**Files:**
- Create: `packages/service/src/routes/auth/schema.ts`

- [ ] **Step 1: Create auth schemas**

Create `packages/service/src/routes/auth/schema.ts`:

```ts
import { z } from "@hono/zod-openapi";

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("AuthError");

export const authUserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    image: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    banned: z.boolean().nullable().optional(),
    banReason: z.string().nullable().optional(),
    banExpires: z.date().nullable().optional(),
    flags: z.array(z.string()),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("AuthUser");

export const authSessionSchema = z
  .object({
    id: z.string(),
    expiresAt: z.date(),
    token: z.string(),
    ipAddress: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    userId: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("AuthSession");

export const sessionResponseSchema = z
  .object({
    user: authUserSchema,
    session: authSessionSchema,
  })
  .nullable()
  .openapi("AuthSessionResponse");

export const signInEmailBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const signUpEmailBodySchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(6),
});

export const updateUserBodySchema = z.object({
  name: z.string().min(1).optional(),
  image: z.string().nullable().optional(),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export const authMutationResponseSchema = z
  .object({
    data: z.unknown().optional(),
    error: z
      .object({
        message: z.string(),
      })
      .nullable()
      .optional(),
  })
  .openapi("AuthMutationResponse");
```

## Task 6: Auth Endpoints

**Files:**
- Create: `packages/service/src/routes/auth/signInEmail.ts`
- Create: `packages/service/src/routes/auth/signUpEmail.ts`
- Create: `packages/service/src/routes/auth/signOut.ts`
- Create: `packages/service/src/routes/auth/getSession.ts`
- Create: `packages/service/src/routes/auth/updateUser.ts`
- Create: `packages/service/src/routes/auth/changePassword.ts`
- Create: `packages/service/src/routes/auth/index.ts`
- Replace: `packages/service/src/routes/auth.routes.ts`
- Modify: `packages/service/src/app.ts`

- [ ] **Step 1: Implement POST `/sign-in/email`**

Create `packages/service/src/routes/auth/signInEmail.ts`:

```ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { verifyPassword } from "#lib/password";
import { createSession, setSessionCookie } from "#lib/session";
import { authMutationResponseSchema, errorSchema, signInEmailBodySchema } from "./schema";

export const signInEmail = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/sign-in/email",
    tags: ["Auth"],
    summary: "Sign in with email and password",
    request: {
      body: {
        content: { "application/json": { schema: signInEmailBodySchema } },
        required: true,
      },
    },
    responses: {
      200: { content: { "application/json": { schema: authMutationResponseSchema } }, description: "Signed in" },
      401: { content: { "application/json": { schema: errorSchema } }, description: "Invalid credentials" },
    },
  }),
  handler: async (c) => {
    const { email, password } = c.req.valid("json");
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { accounts: true },
    });
    const credential = user?.accounts.find(
      (account) => account.providerId === "credential",
    );

    if (
      !user ||
      !credential?.password ||
      !(await verifyPassword(credential.password, password))
    ) {
      throw new HTTPException(401, { message: "Invalid email or password" });
    }

    const session = await createSession({
      userId: user.id,
      ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });

    setSessionCookie(c, session.token);
    return c.json({ data: { user, session }, error: null }, 200);
  },
});
```

- [ ] **Step 2: Implement POST `/sign-up/email`**

Create `packages/service/src/routes/auth/signUpEmail.ts`:

```ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { auth } from "#lib/auth";
import { prisma } from "#lib/db";
import { createSession, setSessionCookie } from "#lib/session";
import { authMutationResponseSchema, errorSchema, signUpEmailBodySchema } from "./schema";

export const signUpEmail = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/sign-up/email",
    tags: ["Auth"],
    summary: "Create a user with email and password",
    request: {
      body: {
        content: { "application/json": { schema: signUpEmailBodySchema } },
        required: true,
      },
    },
    responses: {
      200: { content: { "application/json": { schema: authMutationResponseSchema } }, description: "Signed up" },
      400: { content: { "application/json": { schema: errorSchema } }, description: "Email already exists" },
    },
  }),
  handler: async (c) => {
    const body = c.req.valid("json");
    const existingUser = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existingUser) {
      throw new HTTPException(400, { message: "User already exists" });
    }

    const { user } = await auth.api.createUser({ body: { ...body, role: "user" } });
    const session = await createSession({
      userId: user.id,
      ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });

    setSessionCookie(c, session.token);
    return c.json({ data: { user, session }, error: null }, 200);
  },
});
```

- [ ] **Step 3: Implement POST `/sign-out`**

Create `packages/service/src/routes/auth/signOut.ts`:

```ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { deleteSessionByToken, deleteSessionCookie, getSessionTokenFromContext } from "#lib/session";
import { authMutationResponseSchema } from "./schema";

export const signOut = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/sign-out",
    tags: ["Auth"],
    summary: "Sign out current session",
    responses: {
      200: { content: { "application/json": { schema: authMutationResponseSchema } }, description: "Signed out" },
    },
  }),
  handler: async (c) => {
    await deleteSessionByToken(getSessionTokenFromContext(c));
    deleteSessionCookie(c);
    return c.json({ data: { success: true }, error: null }, 200);
  },
});
```

- [ ] **Step 4: Implement GET `/get-session`**

Create `packages/service/src/routes/auth/getSession.ts`:

```ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { auth } from "#lib/auth";
import { sessionResponseSchema } from "./schema";

export const getSession = defineOpenAPIRoute({
  route: createRoute({
    method: "get",
    path: "/get-session",
    tags: ["Auth"],
    summary: "Get current session",
    responses: {
      200: { content: { "application/json": { schema: sessionResponseSchema } }, description: "Current session or null" },
    },
  }),
  handler: async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return c.json(session, 200);
  },
});
```

- [ ] **Step 5: Implement POST `/update-user`**

Create `packages/service/src/routes/auth/updateUser.ts`:

```ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { auth } from "#lib/auth";
import { prisma } from "#lib/db";
import { authMutationResponseSchema, errorSchema, updateUserBodySchema } from "./schema";

export const updateUser = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/update-user",
    tags: ["Auth"],
    summary: "Update current user profile",
    request: {
      body: {
        content: { "application/json": { schema: updateUserBodySchema } },
        required: true,
      },
    },
    responses: {
      200: { content: { "application/json": { schema: authMutationResponseSchema } }, description: "Updated user" },
      401: { content: { "application/json": { schema: errorSchema } }, description: "Unauthorized" },
    },
  }),
  handler: async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) throw new HTTPException(401, { message: "Unauthorized" });

    const body = c.req.valid("json");
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: body,
    });

    return c.json({ data: { user }, error: null }, 200);
  },
});
```

- [ ] **Step 6: Implement POST `/change-password`**

Create `packages/service/src/routes/auth/changePassword.ts`:

```ts
import { createRoute, defineOpenAPIRoute } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { auth } from "#lib/auth";
import { prisma } from "#lib/db";
import { hashPassword, verifyPassword } from "#lib/password";
import { authMutationResponseSchema, changePasswordBodySchema, errorSchema } from "./schema";

export const changePassword = defineOpenAPIRoute({
  route: createRoute({
    method: "post",
    path: "/change-password",
    tags: ["Auth"],
    summary: "Change current user password",
    request: {
      body: {
        content: { "application/json": { schema: changePasswordBodySchema } },
        required: true,
      },
    },
    responses: {
      200: { content: { "application/json": { schema: authMutationResponseSchema } }, description: "Password changed" },
      401: { content: { "application/json": { schema: errorSchema } }, description: "Unauthorized" },
      400: { content: { "application/json": { schema: errorSchema } }, description: "Invalid current password" },
    },
  }),
  handler: async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) throw new HTTPException(401, { message: "Unauthorized" });

    const body = c.req.valid("json");
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { accounts: true },
    });
    const credential = user?.accounts.find(
      (account) => account.providerId === "credential",
    );

    if (
      !user ||
      !credential?.password ||
      !(await verifyPassword(credential.password, body.currentPassword))
    ) {
      throw new HTTPException(400, { message: "Current password is incorrect" });
    }

    await prisma.account.update({
      where: { id: credential.id },
      data: { password: await hashPassword(body.newPassword) },
    });

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    return c.json({ data: { user: updatedUser }, error: null }, 200);
  },
});
```

- [ ] **Step 7: Aggregate auth routes**

Create `packages/service/src/routes/auth/index.ts`:

```ts
import { OpenAPIHono } from "@hono/zod-openapi";
import { changePassword } from "./changePassword";
import { getSession } from "./getSession";
import { signInEmail } from "./signInEmail";
import { signOut } from "./signOut";
import { signUpEmail } from "./signUpEmail";
import { updateUser } from "./updateUser";

const authRoutes = new OpenAPIHono();

const routes = authRoutes.openapiRoutes([
  signInEmail,
  signUpEmail,
  signOut,
  getSession,
  updateUser,
  changePassword,
] as const);

export { routes as authRoutes };
```

Replace `packages/service/src/routes/auth.routes.ts` with:

```ts
export { authRoutes } from "./auth";
```

- [ ] **Step 8: Remove better-auth Scalar source**

In `packages/service/src/app.ts`, replace:

```ts
sources: [
  { url: "/api/openapi.json", title: "Main" },
  { url: "/api/auth/open-api/generate-schema", title: "Authentication" },
],
```

with:

```ts
sources: [{ url: "/api/openapi.json", title: "Main" }],
```

## Task 7: Admin User Routes And Upload Secret Cleanup

**Files:**
- Modify: `packages/service/src/routes/admin-user/createUser.ts`
- Modify: `packages/service/src/routes/admin-user/updateUser.ts`
- Modify: `packages/service/src/routes/upload/signFile.ts`

- [ ] **Step 1: Rename comments away from better-auth terminology**

In `createUser.ts` and `updateUser.ts`, replace comments that say `better-auth role` with `global auth role`.

Example:

```ts
// Derive global auth role from custom roles (only from admin app)
```

- [ ] **Step 2: Ensure admin create still uses facade**

Keep `packages/service/src/routes/admin-user/createUser.ts` using:

```ts
const result = await auth.api.createUser({
  body: {
    name,
    email,
    password,
    role: "user",
  },
});
```

This now calls the local Argon2/Prisma implementation from Task 4.

- [ ] **Step 3: Keep account-table password updates**

Confirm `packages/service/src/routes/admin-user/updateUser.ts` still writes Argon2 password hashes to `prisma.account` for `providerId: "credential"` and no longer imports `better-auth/crypto`.

- [ ] **Step 4: Remove better-auth secret fallback from upload signing**

In `packages/service/src/routes/upload/signFile.ts`, replace:

```ts
const SIGN_SECRET =
  process.env.UPLOAD_SIGN_SECRET ||
  process.env.BETTER_AUTH_SECRET ||
  "upload-sign-default";
```

with:

```ts
const SIGN_SECRET = process.env.UPLOAD_SIGN_SECRET || "upload-sign-default";
```

## Task 8: Frontend Auth Client

**Files:**
- Replace: `apps/admin/src/lib/api/auth-client.ts`

- [ ] **Step 1: Replace better-auth client with local facade**

Replace `apps/admin/src/lib/api/auth-client.ts` with:

```ts
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string | null;
  flags: string[];
};

type AuthSession = {
  id: string;
  userId: string;
  expiresAt: string;
};

type SessionData = {
  user: AuthUser;
  session: AuthSession;
} | null;

type AuthResult<T> = {
  data?: T;
  error?: { message: string } | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<AuthResult<T>> {
  const res = await fetch(`/api/auth${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const message = payload?.message ?? payload?.error?.message ?? "Request failed";
    toast.error(message);
    return { error: { message } };
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return payload as AuthResult<T>;
  }

  return { data: payload as T, error: null };
}

export const authClient = {
  signIn: {
    email(input: { email: string; password: string }) {
      return request<{ user: AuthUser; session: AuthSession }>("/sign-in/email", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  },
  signUp: {
    email(input: { name: string; email: string; password: string }) {
      return request<{ user: AuthUser; session: AuthSession }>("/sign-up/email", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  },
  signOut() {
    return request<{ success: boolean }>("/sign-out", { method: "POST" });
  },
  getSession() {
    return request<SessionData>("/get-session");
  },
  updateUser(input: { name?: string; image?: string | null }) {
    return request<{ user: AuthUser }>("/update-user", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  changePassword(input: { currentPassword: string; newPassword: string }) {
    return request<{ user: AuthUser }>("/change-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};

export function useSession() {
  const [data, setData] = useState<SessionData>(null);
  const [isPending, setIsPending] = useState(true);

  async function refetch() {
    setIsPending(true);
    try {
      const result = await authClient.getSession();
      setData(result.data ?? null);
      return result;
    } finally {
      setIsPending(false);
    }
  }

  useEffect(() => {
    void refetch();
  }, []);

  return { data, isPending, refetch };
}
```

## Task 9: Frontend Session Hook Call Sites

**Files:**
- Modify: `apps/admin/src/components/layout/sidebar.tsx`
- Modify: `apps/admin/src/app/page.tsx`
- Modify: `apps/admin/src/hooks/use-current-app.ts`

- [ ] **Step 1: Update sidebar session import and usage**

In `apps/admin/src/components/layout/sidebar.tsx`, remove:

```ts
import { useStore } from "better-auth/react";
```

Change the auth import to include `useSession`:

```ts
import { authClient, useSession } from "@/lib/api/auth-client";
```

Replace:

```ts
const session = useStore(authClient.useSession);
const user = session?.data?.user;
```

with:

```ts
const session = useSession();
const user = session.data?.user;
```

- [ ] **Step 2: Update app home page session usage**

In `apps/admin/src/app/page.tsx`, remove:

```ts
import { useStore } from "better-auth/react";
```

Change:

```ts
import { appClient, authClient } from "@/lib/api";
```

to:

```ts
import { appClient, useSession } from "@/lib/api";
```

Replace:

```ts
const session = useStore(authClient.useSession);
```

with:

```ts
const session = useSession();
```

- [ ] **Step 3: Update current-app hook session usage**

In `apps/admin/src/hooks/use-current-app.ts`, remove:

```ts
import { useStore } from "better-auth/react";
```

Change:

```ts
import { appClient, authClient } from "@/lib/api";
```

to:

```ts
import { appClient, useSession } from "@/lib/api";
```

Replace:

```ts
const session = useStore(authClient.useSession);
```

with:

```ts
const session = useSession();
```

- [ ] **Step 4: Verify no better-auth React usage remains**

Run:

```bash
rg "better-auth|useStore\(authClient\.useSession\)|authClient\.useSession" apps packages --glob '!**/.next/**' --glob '!**/node_modules/**' --glob '!**/prisma/generated/**'
```

Expected: no active source matches. Comments mentioning removed behavior should also be renamed or removed.

## Task 10: Tests And Verification

**Files:**
- Modify only if failures identify concrete issues.

- [ ] **Step 1: Regenerate Prisma client**

Run:

```bash
pnpm db:generate
```

Expected: Prisma client generation succeeds.

- [ ] **Step 2: Reset and seed the development database**

Because auth data does not need preservation, reset/reseed instead of writing compatibility migrations.

Run:

```bash
pnpm db:reset
```

Expected: Prisma resets the database, applies migrations, and runs the seed script if configured by Prisma.

- [ ] **Step 3: Run service tests**

Run:

```bash
pnpm --filter @repo/service exec vitest --run
```

Expected: tests pass. Existing tests that mock `auth.api.getSession` should continue to work because the facade shape is preserved.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: Biome passes. If import order changes are needed, run `pnpm lint:fix` and inspect the diff.

- [ ] **Step 5: Build everything**

Run:

```bash
pnpm build
```

Expected: service package and admin app compile without `better-auth` imports.

- [ ] **Step 6: Manual auth checks**

Start the app:

```bash
pnpm dev
```

Check sign-in using a seeded user:

```bash
curl -i -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  --data '{"email":"admin@system.local","password":"admin123"}'
```

Expected:

```txt
HTTP/1.1 200
set-cookie: next101.session_token=...
```

Check session with the returned cookie:

```bash
curl -i http://localhost:3000/api/auth/get-session \
  -H 'cookie: next101.session_token=<token-from-sign-in>'
```

Expected: response body contains `user.email` and `session.id`.

- [ ] **Step 7: Manual UI checks**

In the browser, verify:

- Sign in succeeds.
- Refreshing after sign-in keeps the session.
- Sidebar user name/email/avatar render.
- Sign out redirects to `/sign-in` and clears the session.
- Register creates a user and signs in.
- Profile page loads current user.
- Profile name update works.
- Avatar upload updates `user.image`.
- Password change rejects a wrong current password.
- Password change accepts the correct current password.
- Admin-only pages still reject non-admin users and allow admin users.

## Task 11: Final Cleanup

**Files:**
- Modify only files with leftover references.

- [ ] **Step 1: Confirm better-auth is gone**

Run:

```bash
rg "better-auth|BETTER_AUTH" . --glob '!**/.next/**' --glob '!**/node_modules/**' --glob '!**/tsconfig.tsbuildinfo' --glob '!docs/superpowers/plans/2026-05-29-remove-better-auth.md'
```

Expected: no matches in active source, package manifests, lockfile, or environment fallbacks.

- [ ] **Step 2: Inspect the final diff**

Run:

```bash
git status --short
git diff --stat
git diff -- packages/service/src/lib/auth.ts packages/service/src/lib/password.ts packages/service/src/lib/session.ts packages/service/src/routes/auth.routes.ts packages/service/src/routes/auth packages/service/prisma/schema.prisma apps/admin/src/lib/api/auth-client.ts
```

Expected: the diff contains the self-owned auth implementation and no unrelated rewrites.

- [ ] **Step 3: Commit only if requested**

If the user explicitly asks for a commit, run the required pre-commit inspection first:

```bash
git status --short
git diff
git log --oneline -10
```

Then stage only intended files and commit:

```bash
git add packages/service/package.json apps/admin/package.json packages/shared/package.json pnpm-lock.yaml packages/service/prisma/schema.prisma packages/service/prisma/migrations packages/service/prisma/seed.ts packages/service/src apps/admin/src
git commit -m "refactor: replace better-auth with owned auth"
```

## Risks

- Argon2 native dependency may require install/build tooling on the target deployment platform. If install fails, switch to `@node-rs/argon2` in Task 1 and adjust `password.ts` to its `hash`/`verify` API.
- Resetting auth data means every developer or environment must reseed users before signing in.
- The frontend `useSession` hook is intentionally simple and per-component. If multiple components need shared live cache invalidation, add a small Zustand store later rather than during the initial removal.
- External consumers of better-auth-only endpoints will break. Internal source usage does not require those endpoints.

## Self-Review

- Spec coverage: covers dependency removal, retained Prisma auth models, Argon2 passwords in `Account.password`, owned sessions, auth endpoints, backend facade compatibility, frontend client replacement, data reset, and verification.
- Placeholder scan: no incomplete placeholder language or unspecified implementation steps remain.
- Type consistency: `AuthType`, `AuthUser`, `AuthSession`, endpoint response wrappers, and `authClient` methods are defined before later tasks rely on them.
