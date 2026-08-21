import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

// Apple rotates its public keys rarely; jose re-fetches a key only when it is
// missing from the cache or the cached entry expires.
const jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL), {
  cooldownDuration: 60 * 60 * 1000,
  cacheMaxAge: 7 * 24 * 60 * 60 * 1000,
});

export interface AppleIdentityToken {
  sub: string;
  email?: string;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

/**
 * Verifies a Sign in with Apple `id_token` against Apple's public JWKS.
 *
 * Checks signature (RS256), issuer, expiry, and that `aud` is one of the
 * configured audiences (the Services ID for web flows plus native app bundle
 * IDs). The nonce sent with the authorization request must be supplied, and
 * the token's `nonce` claim must match it exactly, binding the token to the
 * client session that initiated the authorization request.
 *
 * Apple serializes `email_verified` / `is_private_email` as strings, so both
 * string and boolean forms are accepted.
 */
export async function verifyAppleIdentityToken(params: {
  idToken: string;
  nonce: string;
  audiences: string[];
}): Promise<AppleIdentityToken> {
  const { payload } = await jwtVerify(params.idToken, jwks, {
    issuer: APPLE_ISSUER,
    audience: params.audiences,
    algorithms: ["RS256"],
  }).catch((err: unknown) => {
    throw new HTTPException(401, {
      message: `Invalid Apple identity token: ${
        err instanceof Error ? err.message : "verification failed"
      }`,
    });
  });

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new HTTPException(401, {
      message: "Apple identity token has no subject",
    });
  }

  if (payload.nonce !== params.nonce) {
    throw new HTTPException(401, {
      message: "Apple identity token nonce mismatch",
    });
  }

  const email = typeof payload.email === "string" ? payload.email : undefined;
  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";
  const isPrivateEmail =
    payload.is_private_email === true || payload.is_private_email === "true";

  return { sub: payload.sub, email, emailVerified, isPrivateEmail };
}
