import {
  passwordSchema as makePasswordSchema,
  PASSWORD_POLICY,
  PASSWORD_POLICY_MESSAGE,
} from "@repo/shared";
import { hash, verify } from "argon2";

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export { PASSWORD_POLICY };
export const passwordSchema = makePasswordSchema(PASSWORD_POLICY_MESSAGE);

export async function hashPassword(password: string) {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string) {
  return verify(hashValue, password);
}
