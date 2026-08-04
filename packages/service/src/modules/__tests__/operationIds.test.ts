import { describe, expect, it } from "vitest";

const routeModules = import.meta.glob("../*/routes/*/*.ts", { eager: true });

function collectOperationIds(): { id: string; file: string }[] {
  const entries: { id: string; file: string }[] = [];
  for (const [file, mod] of Object.entries(routeModules)) {
    if (file.endsWith("index.ts")) continue;
    for (const value of Object.values(mod as Record<string, unknown>)) {
      const id = (value as { route?: { operationId?: unknown } })?.route
        ?.operationId;
      if (typeof id === "string") entries.push({ id, file });
    }
  }
  return entries;
}

describe("operationId uniqueness", () => {
  it("every operationId is unique across all routes", () => {
    const entries = collectOperationIds();
    expect(entries.length).toBeGreaterThan(0);

    const seen = new Map<string, string[]>();
    for (const { id, file } of entries) {
      seen.set(id, [...(seen.get(id) ?? []), file]);
    }

    const duplicates = [...seen.entries()].filter(
      ([, files]) => files.length > 1,
    );

    const detail = duplicates
      .map(
        ([id, files]) =>
          `"${id}" in:\n${files.map((f) => `  - ${f}`).join("\n")}`,
      )
      .join("\n");

    expect(
      duplicates,
      `Duplicate operationIds:\n${detail || "(none)"}`,
    ).toEqual([]);
  });
});
