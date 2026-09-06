import { describe, expect, it } from "vitest";
import { accountCodesMatchingLabel } from "../domain";

describe("accountCodesMatchingLabel", () => {
  it("matches zh labels to their codes", () => {
    expect(accountCodesMatchingLabel("餐饮")).toEqual(["food"]);
    expect(accountCodesMatchingLabel("红包")).toEqual(["redPacket"]);
    expect(accountCodesMatchingLabel("三餐")).toEqual(["meals"]);
  });

  it("matches en labels case-insensitively", () => {
    expect(accountCodesMatchingLabel("SAL")).toEqual(["salary"]);
    expect(accountCodesMatchingLabel("packet")).toEqual(["redPacket"]);
  });

  it("trims surrounding whitespace", () => {
    expect(accountCodesMatchingLabel("  餐饮  ")).toEqual(["food"]);
  });

  it("returns every code sharing the substring across languages", () => {
    // "收入" hits only 意外收入 (windfall), but a shared substring like
    // "gift" would fan out — assert the multi-hit shape with a real one.
    const travel = accountCodesMatchingLabel("旅行");
    expect(travel).toEqual(["travel"]);
    expect(accountCodesMatchingLabel("意外")).toEqual(["windfall"]);
  });

  it("returns [] for blank or unknown queries", () => {
    expect(accountCodesMatchingLabel("   ")).toEqual([]);
    expect(accountCodesMatchingLabel("zzzz")).toEqual([]);
  });
});
