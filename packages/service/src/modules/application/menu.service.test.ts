import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import {
  getAffectedParentIds,
  getNormalizedSortOrderUpdates,
} from "./menu.service";

describe("menu reorder helpers", () => {
  it("tracks old and new parents for moved menu items", () => {
    const affectedParentIds = getAffectedParentIds(
      [{ id: "menu-1", parentId: "new-parent", sortOrder: 0 }],
      [{ id: "menu-1", parentId: "old-parent", sortOrder: 2 }],
    );

    expect([...affectedParentIds]).toEqual(["old-parent", "new-parent"]);
  });

  it("throws when a reorder item does not exist", () => {
    expect(() =>
      getAffectedParentIds(
        [{ id: "missing", parentId: null, sortOrder: 0 }],
        [{ id: "menu-1", parentId: null, sortOrder: 0 }],
      ),
    ).toThrow(HTTPException);
  });

  it("normalizes sort order within each parent group", () => {
    const updates = getNormalizedSortOrderUpdates([
      { id: "a", parentId: null, sortOrder: 2 },
      { id: "b", parentId: null, sortOrder: 0 },
      { id: "c", parentId: "parent", sortOrder: 3 },
      { id: "d", parentId: "parent", sortOrder: 1 },
    ]);

    expect(updates).toEqual([
      { id: "a", sortOrder: 1 },
      { id: "d", sortOrder: 0 },
      { id: "c", sortOrder: 1 },
    ]);
  });
});
