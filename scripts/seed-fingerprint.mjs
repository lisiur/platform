#!/usr/bin/env node
// Computes a SHA-256 fingerprint of the seed.ts SOURCE so any change to the
// seed procedure OR data produces a new hash. Used by:
//   - assemble.sh     -> writes deploy/seed.fingerprint (debug artifact)
//   - ecosystem       -> reads that file at boot, injects SEED_FINGERPRINT env
//   - apps/gateway dev -> inline `SEED_FINGERPRINT=$(node ...)` before next dev
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(__dirname, "../packages/service/prisma/seed.ts");
const source = readFileSync(seedPath, "utf8");
const fingerprint = createHash("sha256").update(source).digest("hex");
process.stdout.write(fingerprint);
