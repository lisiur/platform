import { OpenAPIHono } from "@hono/zod-openapi";
import { changePassword } from "./changePassword";
import { completeOnboardingRoute } from "./completeOnboarding";
import { getAppleStatus } from "./getAppleStatus";
import { getRegistrationStatus } from "./getRegistrationStatus";
import { getSession } from "./getSession";
import { signInApple } from "./signInApple";
import { signInEmail } from "./signInEmail";
import { signInWechat } from "./signInWechat";
import { signOut } from "./signOut";
import { signUpEmail } from "./signUpEmail";
import { updateUser } from "./updateUser";
import {
  webAuthnCredentials,
  webAuthnLoginOptions,
  webAuthnLoginVerify,
  webAuthnRegisterOptions,
  webAuthnRegisterVerify,
  webAuthnRemoveCredential,
  webAuthnStatus,
} from "./webauthn";

const authRoutes = new OpenAPIHono();

const routes = authRoutes.openapiRoutes([
  signInEmail,
  signInWechat,
  signInApple,
  signUpEmail,
  signOut,
  getSession,
  getRegistrationStatus,
  getAppleStatus,
  updateUser,
  completeOnboardingRoute,
  changePassword,
  webAuthnStatus,
  webAuthnRegisterOptions,
  webAuthnRegisterVerify,
  webAuthnLoginOptions,
  webAuthnLoginVerify,
  webAuthnCredentials,
  webAuthnRemoveCredential,
] as const);

export { routes as authRoutes };
