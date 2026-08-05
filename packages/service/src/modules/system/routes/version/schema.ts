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

export const applyUpdateBodySchema = z
  .object({
    tag: z.string().min(1).optional().openapi({ example: "v1.3.0" }),
  })
  .openapi("ApplyUpdateBody");

export const applyUpdateResultSchema = z
  .object({
    jobId: z.string().openapi({ example: "9b1e2c3d-..." }),
    targetTag: z.string().openapi({ example: "v1.3.0" }),
    tarballUrl: z.string().url(),
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
