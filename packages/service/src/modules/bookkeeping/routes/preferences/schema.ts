import { z } from "@hono/zod-openapi";
import { deleteSuccessSchema } from "#lib/openapi";
import {
  CONFIGURABLE_TABS,
  QUICK_ENTRY_CHIP_FIELDS,
  TAB_LIMITS,
} from "../../domain";

export { deleteSuccessSchema };

const noDuplicates = (items: readonly string[]) =>
  new Set(items).size === items.length;

export const tabsDataSchema = z
  .object({
    tabs: z
      .array(z.enum(CONFIGURABLE_TABS))
      .min(TAB_LIMITS.min)
      .max(TAB_LIMITS.max)
      .refine(noDuplicates, { message: "Duplicate tabs" }),
  })
  .openapi("QianlaiTabsData");

export const quickEntryDataSchema = z
  .object({
    quickEntry: z.object({
      chipFields: z
        .array(z.enum(QUICK_ENTRY_CHIP_FIELDS))
        .max(QUICK_ENTRY_CHIP_FIELDS.length)
        .refine(noDuplicates, { message: "Duplicate chip fields" }),
    }),
  })
  .openapi("QianlaiQuickEntryData");

export const listPreferencesResponseSchema = z
  .object({
    user: tabsDataSchema.nullable(),
    ledgers: z.record(z.string(), quickEntryDataSchema),
    projects: z.record(z.string(), quickEntryDataSchema),
  })
  .openapi("QianlaiPreferences");

export const ledgerIdParamSchema = z.object({
  ledgerId: z.string().min(1).openapi({ example: "clx1234567890" }),
});

export const projectIdParamSchema = z.object({
  projectId: z.string().min(1).openapi({ example: "clx1234567890" }),
});
