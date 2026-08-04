import { createRoute, defineOpenAPIRoute, z } from "@hono/zod-openapi";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { HTTPException } from "hono/http-exception";
import { getPrincipalUserId, requirePrincipal } from "#extractors/session";
import { getClientIpFromContextOrNull } from "#lib/get-client-ip";
import {
  badRequestResponse,
  notFoundResponse,
  okResponseFn,
  unauthorizedResponse,
} from "#lib/openapi";
import { setSessionCookie } from "#lib/session";
import {
  assertWebAuthnEnabled,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  getUserWebAuthnCredentials,
  getWebAuthnEnabled,
  removeWebAuthnCredential,
  verifyAuthentication,
  verifyRegistration,
} from "#modules/identity/webauthn.service";
import {
  signInResponseSchema,
  webAuthnAuthenticationOptionsResponseSchema,
  webAuthnCredentialResponse,
  webAuthnCredentialsResponseSchema,
  webAuthnLoginOptionsBodySchema,
  webAuthnLoginVerifyBodySchema,
  webAuthnRegisterVerifyBodySchema,
  webAuthnRegistrationOptionsResponseSchema,
  webAuthnRemoveCredentialBodySchema,
  webAuthnStatusResponseSchema,
} from "./schema";

export const webAuthnStatus = defineOpenAPIRoute({
  route: createRoute({
    operationId: "webAuthnStatus",
    method: "get",
    path: "/webauthn/status",
    tags: ["Auth"],
    summary: "Get whether WebAuthn sign-in is enabled",
    responses: {
      ...okResponseFn(webAuthnStatusResponseSchema, "WebAuthn status"),
    },
  }),
  handler: async (c) => {
    const webauthnEnabled = await getWebAuthnEnabled();
    return c.json({ webauthnEnabled }, 200);
  },
});

export const webAuthnRegisterOptions = defineOpenAPIRoute({
  route: createRoute({
    operationId: "webAuthnRegisterOptions",
    method: "post",
    path: "/webauthn/register-options",
    tags: ["Auth"],
    summary: "Get WebAuthn registration options",
    responses: {
      ...unauthorizedResponse,
      ...okResponseFn(
        webAuthnRegistrationOptionsResponseSchema,
        "WebAuthn registration options",
      ),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    await assertWebAuthnEnabled();
    const options = await generateRegistrationOptions(userId);
    return c.json(options, 200);
  },
});

export const webAuthnRegisterVerify = defineOpenAPIRoute({
  route: createRoute({
    operationId: "webAuthnRegisterVerify",
    method: "post",
    path: "/webauthn/register-verify",
    tags: ["Auth"],
    summary: "Verify WebAuthn registration",
    request: {
      body: {
        content: {
          "application/json": { schema: webAuthnRegisterVerifyBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...okResponseFn(webAuthnCredentialResponse, "Registered credential"),
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);
    await assertWebAuthnEnabled();
    const { credential, deviceName } = c.req.valid("json");
    const created = await verifyRegistration({
      userId,
      credential: credential as RegistrationResponseJSON,
      deviceName,
      traceId: c.get("traceId"),
    });
    return c.json(created, 200);
  },
});

export const webAuthnLoginOptions = defineOpenAPIRoute({
  route: createRoute({
    operationId: "webAuthnLoginOptions",
    method: "post",
    path: "/webauthn/login-options",
    tags: ["Auth"],
    summary: "Get WebAuthn login options",
    request: {
      body: {
        content: {
          "application/json": { schema: webAuthnLoginOptionsBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...badRequestResponse,
      ...okResponseFn(
        webAuthnAuthenticationOptionsResponseSchema,
        "WebAuthn login options",
      ),
    },
  }),
  handler: async (c) => {
    await assertWebAuthnEnabled();
    const { email } = c.req.valid("json");
    const options = await generateAuthenticationOptions(email);
    return c.json(options, 200);
  },
});

export const webAuthnLoginVerify = defineOpenAPIRoute({
  route: createRoute({
    operationId: "webAuthnLoginVerify",
    method: "post",
    path: "/webauthn/login-verify",
    tags: ["Auth"],
    summary: "Verify WebAuthn login",
    request: {
      body: {
        content: {
          "application/json": { schema: webAuthnLoginVerifyBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...badRequestResponse,
      ...okResponseFn(signInResponseSchema, "Signed in with WebAuthn"),
    },
  }),
  handler: async (c) => {
    await assertWebAuthnEnabled();
    const { email, credential } = c.req.valid("json");
    const { user, session } = await verifyAuthentication({
      email,
      credential: credential as AuthenticationResponseJSON,
      ipAddress: getClientIpFromContextOrNull(c),
      userAgent: c.req.header("user-agent") ?? null,
      traceId: c.get("traceId"),
    });

    setSessionCookie(c, session.token);

    return c.json({ user, session }, 200);
  },
});

export const webAuthnCredentials = defineOpenAPIRoute({
  route: createRoute({
    operationId: "webAuthnCredentials",
    method: "get",
    path: "/webauthn/credentials",
    tags: ["Auth"],
    summary: "Get user's WebAuthn credentials",
    responses: {
      ...okResponseFn(
        webAuthnCredentialsResponseSchema,
        "User's WebAuthn credentials",
      ),
      ...unauthorizedResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    const userId = getPrincipalUserId(principal);

    const credentials = await getUserWebAuthnCredentials(userId);
    return c.json({ credentials }, 200);
  },
});

export const webAuthnRemoveCredential = defineOpenAPIRoute({
  route: createRoute({
    operationId: "webAuthnRemoveCredential",
    method: "delete",
    path: "/webauthn/credentials",
    tags: ["Auth"],
    summary: "Remove a WebAuthn credential",
    request: {
      body: {
        content: {
          "application/json": { schema: webAuthnRemoveCredentialBodySchema },
        },
        required: true,
      },
    },
    responses: {
      ...okResponseFn(z.object({ success: z.boolean() }), "Credential removed"),
      ...unauthorizedResponse,
      ...badRequestResponse,
      ...notFoundResponse,
    },
  }),
  handler: async (c) => {
    const principal = await requirePrincipal(c);
    if (principal.kind !== "user") {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    const userId = getPrincipalUserId(principal);
    const { credentialId } = c.req.valid("json");

    await removeWebAuthnCredential(userId, credentialId);
    return c.json({ success: true }, 200);
  },
});
