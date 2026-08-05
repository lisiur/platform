import { z } from "@hono/zod-openapi";

export const versionInfoSchema = z
  .object({
    version: z.string().openapi({ example: "v1.2.3" }),
    gitSha: z.string().openapi({ example: "ace6b52" }),
    buildTime: z.string().openapi({ example: "2026-08-04T10:00:00.000Z" }),
  })
  .openapi("VersionInfo");

export const latestReleaseSchema = z
  .object({
    tag: z.string().openapi({ example: "v1.3.0" }),
    name: z.string().nullable().openapi({ example: "v1.3.0" }),
    htmlUrl: z.string().url().openapi({
      example: "https://github.com/lisiur/platform/releases/tag/v1.3.0",
    }),
    publishedAt: z.string().openapi({ example: "2026-08-01T12:00:00Z" }),
    tarballUrl: z.string().url().openapi({
      example:
        "https://github.com/lisiur/platform/releases/download/v1.3.0/platform-deploy-v1.3.0.tar.gz",
    }),
    tarballSize: z.number().openapi({ example: 52428800 }),
    newer: z.boolean().openapi({ example: true }),
  })
  .openapi("LatestRelease");

export const applyUpdateModeSchema = z
  .enum(["update", "redeploy"])
  .openapi({ example: "update" });

export const applyUpdateBodySchema = z
  .object({
    tag: z.string().min(1).optional().openapi({ example: "v1.3.0" }),
    mode: applyUpdateModeSchema.optional().openapi({
      description:
        "update keeps database data and runs migrations; redeploy stops PM2, resets the database, and starts PM2 again.",
    }),
  })
  .openapi("ApplyUpdateBody");

export const applyUpdateResultSchema = z
  .object({
    jobId: z.string().openapi({ example: "9b1e2c3d-..." }),
    targetTag: z.string().openapi({ example: "v1.3.0" }),
    tarballUrl: z.string().url(),
    mode: applyUpdateModeSchema,
  })
  .openapi("ApplyUpdateResult");

export const updateStatusSchema = z
  .object({
    phase: z
      .enum(["idle", "running", "succeeded", "failed"])
      .openapi({ example: "running" }),
    step: z.string().openapi({ example: "extracting" }),
    message: z.string().openapi({ example: "Extracting tarball" }),
    targetTag: z.string().nullable().openapi({ example: "v1.3.0" }),
    mode: applyUpdateModeSchema.nullable().openapi({ example: "update" }),
    progress: z
      .object({
        downloadedBytes: z.number().int().nonnegative(),
        totalBytes: z.number().int().nonnegative().nullable(),
        percent: z.number().min(0).max(100).nullable(),
      })
      .nullable()
      .openapi({
        description: "Download progress for the current update step, if known.",
      }),
    startedAt: z
      .string()
      .nullable()
      .openapi({ example: "2026-08-04T10:00:00Z" }),
    updatedAt: z
      .string()
      .nullable()
      .openapi({ example: "2026-08-04T10:00:05Z" }),
  })
  .openapi("UpdateStatus");
