import { z } from "@hono/zod-openapi";
import { passwordSchema } from "#lib/password";

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
    avatar: z.string().nullable().optional(),
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
    activeOrganizationId: z.string().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("AuthSession");

export const sessionResponseSchema = z
  .object({
    user: authUserSchema.nullable(),
    session: authSessionSchema.nullable(),
    permissions: z.array(z.string()),
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
  password: passwordSchema,
});

export const updateUserBodySchema = z.object({
  name: z.string().min(1).optional(),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const signInWechatBodySchema = z.object({
  code: z.string().min(1),
});

export const signInAppleBodySchema = z.object({
  identityToken: z.string().min(1),
  nonce: z.string().min(1).max(256),
  user: z
    .object({
      firstName: z.string().max(128).optional(),
      lastName: z.string().max(128).optional(),
    })
    .optional(),
});

export const appleStatusResponseSchema = z
  .object({
    appleEnabled: z.boolean(),
    clientId: z.string().nullable(),
  })
  .openapi("AppleStatus");

export const registrationStatusSchema = z
  .object({
    registrationEnabled: z.boolean(),
  })
  .openapi("RegistrationStatus");

export const signInResponseSchema = z
  .object({
    user: authUserSchema,
    session: authSessionSchema,
  })
  .openapi("SignInResponse");

export const userMutationResponseSchema = z
  .object({
    user: authUserSchema,
  })
  .openapi("UserMutationResponse");

export const webAuthnCredentialResponse = z
  .object({
    id: z.string(),
    credentialId: z.string(),
    deviceType: z.enum(["platform", "cross-platform"]),
    deviceName: z.string(),
    createdAt: z.date(),
  })
  .openapi("WebAuthnCredential");

// Authenticator payloads are base64url-encoded CBOR / DER blobs. Cap each
// field well above any plausible authenticator output to reject obviously
// bogus payloads without breaking legitimate large hardware tokens.
const BASE64_MAX = 65_536;
const ID_MAX = 1_024;

export const webAuthnRegisterVerifyBodySchema = z.object({
  credential: z.object({
    id: z.string().max(ID_MAX),
    rawId: z.string().max(BASE64_MAX),
    type: z.literal("public-key"),
    response: z.object({
      attestationObject: z.string().max(BASE64_MAX),
      clientDataJSON: z.string().max(BASE64_MAX),
      transports: z
        .array(
          z.enum([
            "usb",
            "nfc",
            "ble",
            "internal",
            "hybrid",
            "cable",
            "smart-card",
          ]),
        )
        .max(8)
        .optional(),
    }),
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
    clientExtensionResults: z.unknown().optional(),
  }),
  deviceName: z.string().max(128).optional(),
});

export const webAuthnLoginOptionsBodySchema = z.object({
  email: z.email().max(254).optional(),
});

export const webAuthnLoginVerifyBodySchema = z.object({
  email: z.email().max(254).optional(),
  credential: z.object({
    id: z.string().max(ID_MAX),
    rawId: z.string().max(BASE64_MAX),
    type: z.literal("public-key"),
    response: z.object({
      authenticatorData: z.string().max(BASE64_MAX),
      clientDataJSON: z.string().max(BASE64_MAX),
      signature: z.string().max(BASE64_MAX),
      userHandle: z.string().max(ID_MAX).optional(),
    }),
  }),
});

export const webAuthnCredentialsResponseSchema = z
  .object({
    credentials: z.array(webAuthnCredentialResponse),
  })
  .openapi("WebAuthnCredentialsResponse");

export const webAuthnRemoveCredentialBodySchema = z.object({
  credentialId: z.string().max(ID_MAX),
});

export const webAuthnStatusResponseSchema = z
  .object({
    webauthnEnabled: z.boolean(),
  })
  .openapi("WebAuthnStatus");

export const webAuthnRegistrationOptionsResponseSchema = z
  .object({
    challenge: z.string(),
    rp: z.object({
      name: z.string(),
      id: z.string().optional(),
    }),
    user: z.object({
      id: z.string(),
      name: z.string(),
      displayName: z.string(),
    }),
    pubKeyCredParams: z.array(
      z.object({ alg: z.number(), type: z.literal("public-key") }),
    ),
    authenticatorSelection: z
      .object({
        authenticatorAttachment: z
          .enum(["platform", "cross-platform"])
          .optional(),
        userVerification: z.string().optional(),
        residentKey: z.string().optional(),
      })
      .optional(),
    timeout: z.number().optional(),
    attestation: z.string().optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("WebAuthnRegistrationOptions");

export const webAuthnAuthenticationOptionsResponseSchema = z
  .object({
    challenge: z.string(),
    timeout: z.number().optional(),
    rpId: z.string().optional(),
    userVerification: z.string().optional(),
    allowCredentials: z
      .array(
        z.object({
          id: z.string(),
          type: z.literal("public-key"),
        }),
      )
      .optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("WebAuthnAuthenticationOptions");
