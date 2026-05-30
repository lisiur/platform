import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(__dirname, "..");
const migrationsDir = resolve(serviceRoot, "prisma/migrations");
const initMigrationName = "00000000000000_init";
const initMigrationDir = resolve(migrationsDir, initMigrationName);
const initMigrationFile = resolve(initMigrationDir, "migration.sql");

function run(command, args, { ignoreFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: serviceRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0 && !ignoreFailure) {
    process.exit(result.status ?? 1);
  }

  return result.status;
}

function getOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: serviceRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = resolve(serviceRoot, ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf8");
    const match = content.match(/^DATABASE_URL=(.+)$/m);
    if (match) {
      let value = match[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  }

  console.error("[db:reset:danger] DATABASE_URL is not set");
  process.exit(1);
}

function deleteMigrationRecord() {
  const url = getDatabaseUrl();
  const parsed = new URL(url);
  const db = parsed.pathname.slice(1);
  const host = parsed.hostname;
  const port = parsed.port || "5432";
  const user = parsed.username;
  const password = parsed.password;

  const env = { ...process.env };
  if (password) env.PGPASSWORD = password;

  const result = spawnSync(
    "psql",
    [
      "-h",
      host,
      "-p",
      port,
      "-U",
      user,
      "-d",
      db,
      "-c",
      `DELETE FROM _prisma_migrations WHERE migration_name = '${initMigrationName}';`,
    ],
    {
      cwd: serviceRoot,
      stdio: "pipe",
      encoding: "utf8",
      shell: process.platform === "win32",
      env,
    },
  );

  if (result.status === 0) {
    console.log(
      "[db:reset:danger] Deleted existing migration record (if any).",
    );
  }
}

console.log("[db:reset:danger] Removing Prisma migrations...");
if (existsSync(migrationsDir)) {
  rmSync(migrationsDir, { recursive: true, force: true });
}
mkdirSync(migrationsDir, { recursive: true });

console.log("[db:reset:danger] Recreating init migration...");
mkdirSync(initMigrationDir, { recursive: true });
const initSql = getOutput("pnpm", [
  "exec",
  "prisma",
  "migrate",
  "diff",
  "--from-empty",
  "--to-schema",
  "prisma/schema.prisma",
  "--script",
]);
writeFileSync(initMigrationFile, initSql);
writeFileSync(
  resolve(migrationsDir, "migration_lock.toml"),
  'provider = "postgresql"\n',
);

console.log("[db:reset:danger] Pushing schema to database...");
run("pnpm", ["exec", "prisma", "db", "push", "--force-reset"]);

console.log("[db:reset:danger] Cleaning up stale migration records...");
deleteMigrationRecord();

console.log("[db:reset:danger] Marking init migration as applied...");
run("pnpm", [
  "exec",
  "prisma",
  "migrate",
  "resolve",
  "--applied",
  initMigrationName,
  "--schema",
  "prisma/schema.prisma",
]);

console.log("[db:reset:danger] Resetting database from migration history...");
run("pnpm", ["exec", "prisma", "migrate", "reset", "--force"]);

console.log("[db:reset:danger] Seeding database...");
run("pnpm", ["exec", "tsx", "prisma/seed.ts"]);

console.log("[db:reset:danger] Done.");
