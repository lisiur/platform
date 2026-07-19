import { z } from "zod";

export const PASSWORD_POLICY = {
  minLength: 10,
  maxLength: 256,
} as const;

export const PASSWORD_POLICY_MESSAGE =
  "Password must be 10–256 characters long and contain both letters and numbers";

export function passwordSchema(message: string = PASSWORD_POLICY_MESSAGE) {
  return z
    .string()
    .min(PASSWORD_POLICY.minLength, message)
    .max(PASSWORD_POLICY.maxLength, message)
    .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), message);
}
