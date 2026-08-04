import { z } from "@hono/zod-openapi";

export const cpuInfoSchema = z
  .object({
    usage: z
      .number()
      .openapi({ example: 45.2, description: "CPU usage percentage" }),
    cores: z
      .number()
      .openapi({ example: 8, description: "Number of CPU cores" }),
    model: z.string().openapi({ example: "Apple M1 Pro" }),
  })
  .openapi("CpuInfo");

export const memoryInfoSchema = z
  .object({
    total: z
      .number()
      .openapi({ example: 17179869184, description: "Total bytes" }),
    used: z
      .number()
      .openapi({ example: 10737418240, description: "Used bytes" }),
    usedPercent: z
      .number()
      .openapi({ example: 62.5, description: "Used percentage" }),
  })
  .openapi("MemoryInfo");

export const storageInfoSchema = z
  .object({
    total: z
      .number()
      .openapi({ example: 494384795648, description: "Total bytes" }),
    used: z
      .number()
      .openapi({ example: 202124939264, description: "Used bytes" }),
    usedPercent: z
      .number()
      .openapi({ example: 40.9, description: "Used percentage" }),
  })
  .openapi("StorageInfo");

export const processInfoSchema = z
  .object({
    cpu: z
      .number()
      .openapi({ example: 3.2, description: "Process CPU usage %" }),
    memory: z.number().openapi({
      example: 157286400,
      description: "Process RSS in bytes",
    }),
    memoryPercent: z
      .number()
      .openapi({ example: 0.9, description: "Process memory %" }),
    uptime: z
      .number()
      .openapi({ example: 3600, description: "Process uptime in seconds" }),
  })
  .openapi("ProcessInfo");

export const systemInfoSchema = z
  .object({
    cpu: cpuInfoSchema,
    memory: memoryInfoSchema,
    storage: storageInfoSchema,
    process: processInfoSchema,
  })
  .openapi("SystemInfo");

export const errorSchema = z
  .object({
    code: z.number().openapi({ example: 400 }),
    message: z.string().openapi({ example: "Bad Request" }),
  })
  .openapi("Error");
