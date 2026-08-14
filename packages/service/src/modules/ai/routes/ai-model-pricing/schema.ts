import { z } from "@hono/zod-openapi";
import { idParamSchema, paginationQuerySchema } from "#lib/openapi";

export { deleteSuccessSchema, errorSchema } from "#lib/openapi";

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validateTimeRange(
  start: number | undefined,
  end: number | undefined,
  ctx: z.RefinementCtx,
) {
  if (start === undefined || end === undefined) return;
  if (start === end) {
    ctx.addIssue({
      code: "custom",
      path: ["endMinutes"],
      message: "Time range must not be empty",
    });
  }
}

const MINUTES_PER_DAY = 1440;
type TimeInterval = [number, number];

function normalizeTimeRange(start: number, end: number): TimeInterval[] {
  if (start === 0 && end === MINUTES_PER_DAY) return [[0, MINUTES_PER_DAY]];
  if (start < end) return [[start, end]];

  const intervals: TimeInterval[] = [[start, MINUTES_PER_DAY]];
  if (end > 0) intervals.push([0, end]);
  return intervals;
}

function validatePolicyCoverage(
  policy: Array<{ startMinutes: number; endMinutes: number }>,
  ctx: z.RefinementCtx,
) {
  if (policy.length === 0) return;

  const intervals = policy
    .flatMap((item) => normalizeTimeRange(item.startMinutes, item.endMinutes))
    .sort((a, b) => a[0] - b[0]);
  let coveredUntil = 0;
  for (const [start, end] of intervals) {
    if (start < coveredUntil) {
      ctx.addIssue({
        code: "custom",
        path: ["policy"],
        message: "Pricing policy time ranges must not overlap",
      });
      return;
    }
    if (start > coveredUntil) {
      ctx.addIssue({
        code: "custom",
        path: ["policy"],
        message: "Pricing policy time ranges must cover all day",
      });
      return;
    }
    coveredUntil = end;
  }
  if (coveredUntil !== MINUTES_PER_DAY) {
    ctx.addIssue({
      code: "custom",
      path: ["policy"],
      message: "Pricing policy time ranges must cover all day",
    });
  }
}

const timeZoneSchema = z.string().min(1).refine(isValidTimeZone, {
  message: "Invalid time zone",
});

const timeStartMinutesSchema = z.number().int().min(0).max(1439);
const timeEndMinutesSchema = z.number().int().min(0).max(1440);

export const aiModelPricingPolicyItemSchema = z
  .object({
    input: z.number().nonnegative().openapi({ example: 0.15 }),
    cachedInput: z.number().nonnegative().openapi({ example: 0.075 }),
    output: z.number().nonnegative().openapi({ example: 0.6 }),
    startMinutes: timeStartMinutesSchema.openapi({ example: 60 }),
    endMinutes: timeEndMinutesSchema.openapi({ example: 240 }),
  })
  .superRefine((data, ctx) => {
    validateTimeRange(data.startMinutes, data.endMinutes, ctx);
  });

const policySchema = aiModelPricingPolicyItemSchema
  .array()
  .min(1)
  .superRefine(validatePolicyCoverage);

export const aiModelPricingSchema = z
  .object({
    id: z.string().openapi({ example: "clx1234567890" }),
    modelId: z.string().openapi({ example: "clxModel" }),
    accountId: z.string().openapi({ example: "clxAccount" }),
    timeZone: z.string().openapi({ example: "UTC" }),
    policy: policySchema,
    effectiveFrom: z.date(),
    effectiveTo: z.date().nullable(),
    createdAt: z.date(),
  })
  .openapi("AiModelPricing");

export const createAiModelPricingBodySchema = z
  .object({
    modelId: z.string().min(1),
    accountId: z.string().min(1),
    timeZone: timeZoneSchema,
    policy: policySchema,
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.coerce.date().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.effectiveTo && data.effectiveTo <= data.effectiveFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: "Effective end must be after effective start",
      });
    }
  });

export const updateAiModelPricingBodySchema = z
  .object({
    timeZone: timeZoneSchema.optional(),
    policy: policySchema.optional(),
    effectiveFrom: z.coerce.date().optional(),
    effectiveTo: z.coerce.date().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.effectiveTo &&
      data.effectiveFrom &&
      data.effectiveTo <= data.effectiveFrom
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: "Effective end must be after effective start",
      });
    }
  });

export const listAiModelPricingQuerySchema = paginationQuerySchema.extend({
  modelId: z.string().optional(),
  accountId: z.string().optional(),
});

export const aiModelPricingIdParamSchema = idParamSchema();

export const listAiModelPricingResponseSchema = z
  .object({
    pricing: aiModelPricingSchema.array(),
    total: z.number(),
  })
  .openapi("ListAiModelPricingResponse");
