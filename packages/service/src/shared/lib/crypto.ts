import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.AI_SECRET_KEY;
  if (raw) return createHash("sha256").update(raw).digest();
  if (process.env.NODE_ENV === "production") {
    throw new Error("AI_SECRET_KEY must be set in production.");
  }
  return createHash("sha256").update("platform-dev-insecure-key").digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [enc, iv, tag].map((b) => b.toString("base64")).join(":");
}

export function decryptSecret(payload: string): string {
  const [encB64, ivB64, tagB64] = payload.split(":");
  if (!encB64 || !ivB64 || !tagB64) {
    throw new Error("Invalid encrypted secret payload.");
  }
  const decipher = createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
