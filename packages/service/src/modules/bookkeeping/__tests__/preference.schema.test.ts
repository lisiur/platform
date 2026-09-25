import { describe, expect, it } from "vitest";
import { QUICK_ENTRY_CHIP_FIELDS } from "../domain";
import {
  quickEntryDataSchema,
  tabsDataSchema,
} from "../routes/preferences/schema";

describe("tabsDataSchema", () => {
  it("accepts the stats tab alongside the shipped ones", () => {
    const parsed = tabsDataSchema.parse({ tabs: ["journal", "stats"] });
    expect(parsed.tabs).toEqual(["journal", "stats"]);
  });

  it("rejects unknown tabs", () => {
    expect(() => tabsDataSchema.parse({ tabs: ["dragon"] })).toThrow();
  });
});

describe("quickEntryDataSchema", () => {
  it("offers every chip-capable field", () => {
    // Dropping any chip-capable field from this list silently strands it
    // in the more-fields form — the merchant/attachments omission shipped
    // exactly that bug.
    expect(QUICK_ENTRY_CHIP_FIELDS).toContain("countsInLedger");
    expect(QUICK_ENTRY_CHIP_FIELDS).toContain("budget");
    expect(QUICK_ENTRY_CHIP_FIELDS).toContain("merchant");
    expect(QUICK_ENTRY_CHIP_FIELDS).toContain("attachments");
    // project has no chip builder and must never validate.
    expect(QUICK_ENTRY_CHIP_FIELDS).not.toContain("project");
  });

  it("preserves the client's chip order verbatim", () => {
    // Chip order is user data: the stored arrangement must round-trip in
    // the sent order, not the field enum's canonical order.
    const sent = ["budget", "memo", "countsInLedger", "time"];
    const parsed = quickEntryDataSchema.parse({
      quickEntry: { chipFields: sent },
    });
    expect(parsed.quickEntry.chipFields).toEqual(sent);
  });

  it("accepts the full field set", () => {
    const parsed = quickEntryDataSchema.parse({
      quickEntry: { chipFields: [...QUICK_ENTRY_CHIP_FIELDS] },
    });
    expect(parsed.quickEntry.chipFields).toHaveLength(
      QUICK_ENTRY_CHIP_FIELDS.length,
    );
  });

  it("rejects unknown fields, duplicates, and over-long arrangements", () => {
    expect(() =>
      quickEntryDataSchema.parse({ quickEntry: { chipFields: ["dragon"] } }),
    ).toThrow();
    expect(() =>
      quickEntryDataSchema.parse({
        quickEntry: { chipFields: ["memo", "memo"] },
      }),
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
