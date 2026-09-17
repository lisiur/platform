import { describe, expect, it } from "vitest";
import { QUICK_ENTRY_CHIP_FIELDS } from "../domain";
import { quickEntryDataSchema } from "../routes/preferences/schema";

describe("quickEntryDataSchema", () => {
  it("offers the counting toggles as chip fields", () => {
    // The counting toggles are chip-capable like the rest — dropping either
    // from this list silently strands them in the more-fields form.
    expect(QUICK_ENTRY_CHIP_FIELDS).toContain("countsInLedger");
    expect(QUICK_ENTRY_CHIP_FIELDS).toContain("budget");
    // project has no chip builder and must never validate.
    expect(QUICK_ENTRY_CHIP_FIELDS).not.toContain("project");
  });

  it("preserves the client's chip order verbatim", () => {
    // Chip order is user data: the stored arrangement must round-trip in
    // the sent order, not the field enum's canonical order.
    const sent = ["budget", "memo", "countsInLedger", "time"];
    const parsed = quickEntryDataSchema.parse({ quickEntry: { chipFields: sent } });
    expect(parsed.quickEntry.chipFields).toEqual(sent);
  });

  it("accepts the full field set", () => {
    const parsed = quickEntryDataSchema.parse({
      quickEntry: { chipFields: [...QUICK_ENTRY_CHIP_FIELDS] },
    });
    expect(parsed.quickEntry.chipFields).toHaveLength(QUICK_ENTRY_CHIP_FIELDS.length);
  });

  it("rejects unknown fields, duplicates, and over-long arrangements", () => {
    expect(() =>
      quickEntryDataSchema.parse({ quickEntry: { chipFields: ["dragon"] } }),
    ).toThrow();
    expect(() =>
      quickEntryDataSchema.parse({ quickEntry: { chipFields: ["memo", "memo"] } }),
    ).toThrow();
    expect(() =>
      quickEntryDataSchema.parse({
        quickEntry: {
          chipFields: Array(QUICK_ENTRY_CHIP_FIELDS.length + 1).fill("memo"),
        },
      }),
    ).toThrow();
  });
});
