# Merge lib/auth.ts into services/auth.service.ts

## Context

`lib/auth.ts` is a thin facade that wraps `getSession` and `createUser` behind an `auth.api.*` pattern (mimicking better-auth's API). It has 10 consumers across the service but adds unnecessary indirection — the functions it wraps already live in `lib/session.ts` and `lib/auth.ts` itself. The types it exports (`AuthType`, `AuthSessionUser`, `AuthSession`) are re-exported from the package index but never imported by external consumers.

## Goal

Eliminate the `lib/auth.ts` facade by flattening its functions into `services/auth.service.ts` as direct exports.

## Changes

### 1. Move types into `services/auth.service.ts`

Move `AuthSessionUser`, `AuthSession`, `AuthType` type definitions from `lib/auth.ts` into the top of `auth.service.ts`.

### 2. Inline `getSession` into `auth.service.ts`

The existing `getSession` in `auth.service.ts` already delegates to `auth.api.getSession`. Inline the logic:

```ts
export async function getSession(headers: Headers): Promise<AuthType | null> {
  const token = getSessionTokenFromHeaders(headers);
  const result = await getSessionByToken(token);
  if (!result) return null;
  const { user, ...session } = result;
  return { user, session };
}
```

Remove the `auth` import.

### 3. Inline `createUser` into `auth.service.ts`

The existing `signUpWithEmail` already calls `auth.api.createUser`. Inline the logic directly into a `createUser` export:

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

Update `signUpWithEmail` to call `createUser` directly instead of `auth.api.createUser`.

### 4. Delete `lib/auth.ts`

Remove the file entirely.

### 5. Update `packages/service/src/index.ts`

Change:
```ts
export { type AuthType, auth } from "./lib/auth";
```
To:
```ts
export { type AuthType } from "./services/auth.service";
```

Remove the `auth` export (no external consumers use it).

### 6. Update import sites (10 files)

Replace `import { auth } from "#lib/auth"` with `import { getSession } from "#services/auth.service"` (or `createUser` as needed). Update call sites from `auth.api.getSession(...)` to `getSession(...)`.

Files:
- `routes/upload/signFile.ts`
- `routes/upload/uploadFile.ts`
- `routes/user-role/getUserAppRoles.ts`
- `routes/menu-role/getMine.ts`
- `middleware/require-admin.ts`
- `lib/logger.ts`
- `routes/application/__tests__/application.test.ts`

Note: `services/auth.service.ts` and `services/user.service.ts` already import from `#lib/auth` — these are handled by the inline steps above.

## No external breaking changes

- `AuthType` is still exported from the package index (path changes but type is identical)
- The `auth` object was exported but never imported by consumers — safe to remove
- Admin app's `auth-client.ts` defines its own types and calls HTTP routes — unaffected

## Verification

1. Run `pnpm lint` to confirm no broken imports
2. Run `pnpm --filter @repo/service exec vitest --run` to verify tests pass
3. Run `pnpm build` to confirm type checking passes
