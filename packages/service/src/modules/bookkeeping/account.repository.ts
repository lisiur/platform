import { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { ADJUSTMENT_OFFSET_ACCOUNT_FLAG } from "./domain";

export const accountRepository = {
  listByLedger(ledgerId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.findMany({
      where: { ledgerId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  },

  findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.findUnique({ where: { id } });
  },

  findManyByIds(
    ledgerId: string,
    ids: string[],
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.bookAccount.findMany({ where: { ledgerId, id: { in: ids } } });
  },

  /** Siblings of one parent group, in display order (for normalization). */
  listSiblings(
    ledgerId: string,
    parentId: string | null,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.bookAccount.findMany({
      where: { ledgerId, parentId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  },

  /** Highest sortOrder within a sibling group; -1 when the group is empty. */
  async findMaxSortOrder(
    ledgerId: string,
    parentId: string | null,
    tx: Prisma.TransactionClient = prisma,
  ) {
    const row = await tx.bookAccount.findFirst({
      where: { ledgerId, parentId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    return row?.sortOrder ?? -1;
  },

  /**
   * Walks the parent chain from `startId` and returns every ancestor id (one
   * round-trip via a recursive CTE). Empty result when the start id is missing.
   * Cycle-safe: a previously-seen id stops the walk via a path array.
   */
  async findAncestorIds(
    startId: string,
    tx: Prisma.TransactionClient = prisma,
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE ancestors AS (
        SELECT "id", "parentId", ARRAY["id"] AS path
        FROM "qianlai_book_account"
        WHERE "id" = ${startId}
        UNION ALL
        SELECT ba."id", ba."parentId", a.path || ba."id"
        FROM "qianlai_book_account" ba
        INNER JOIN ancestors a ON ba."id" = a."parentId"
        WHERE NOT (ba."id" = ANY(a.path))
      )
      SELECT "id" FROM ancestors
    `;
    return rows.map((r) => r.id);
  },

  /**
   * Seeds the starter chart in list order. Accounts with `parentCode` are
   * inserted after the roots, linked to the parent row created above (one
   * nesting level: a parent must not itself carry a parentCode).
   */
  async createStarterAccounts(
    ledgerId: string,
    accounts: Array<{
      type: string;
      sortOrder: number;
      code?: string | null;
      icon?: string | null;
      flags?: string[];
      meta?: Record<string, unknown> | null;
      parentCode?: string | null;
    }>,
    tx: Prisma.TransactionClient = prisma,
  ) {
    if (accounts.length === 0) return { count: 0 };
    const toRow = (a: (typeof accounts)[number], parentId?: string | null) => ({
      type: a.type,
      sortOrder: a.sortOrder,
      code: a.code,
      icon: a.icon,
      flags: a.flags,
      meta:
        a.meta === undefined || a.meta === null
          ? undefined
          : (a.meta as Prisma.InputJsonValue),
      ledgerId,
      name: null,
      parentId,
    });
    const roots = accounts.filter((a) => !a.parentCode);
    const children = accounts.filter((a) => a.parentCode != null);
    // createManyAndReturn returns ids so children can link by parent code.
    const createdRoots = await tx.bookAccount.createManyAndReturn({
      data: roots.map((a) => toRow(a)),
      select: { id: true, code: true },
    });
    if (children.length === 0) return { count: accounts.length };
    const idByCode = new Map(
      createdRoots
        .filter((r): r is { id: string; code: string } => r.code !== null)
        .map((r) => [r.code, r.id]),
    );
    await tx.bookAccount.createMany({
      data: children.map((a) =>
        toRow(a, idByCode.get(a.parentCode as string) ?? null),
      ),
    });
    return { count: accounts.length };
  },

  create(
    data: {
      ledgerId: string;
      /** User-created accounts always have a name; seeded ones don't. */
      name: string | null;
      code?: string | null;
      type: string;
      sortOrder?: number;
      parentId?: string | null;
      icon?: string | null;
      flags?: string[];
      meta?: Record<string, unknown> | null;
      /** Links the pocket to an owner-private master account. */
      realAccountId?: string | null;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.bookAccount.create({
      data: {
        ...data,
        meta:
          data.meta === undefined || data.meta === null
            ? undefined
            : (data.meta as Prisma.InputJsonValue),
      },
    });
  },

  update(
    id: string,
    data: {
      /** Null clears the user override (falls back to the code's label). */
      name?: string | null;
      parentId?: string | null;
      sortOrder?: number;
      status?: string;
      icon?: string | null;
      meta?: Record<string, unknown> | null;
      /** Null unlinks the pocket from its master account. */
      realAccountId?: string | null;
    },
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.bookAccount.update({
      where: { id },
      data: {
        ...data,
        meta:
          data.meta === undefined
            ? undefined
            : data.meta === null
              ? Prisma.DbNull
              : (data.meta as Prisma.InputJsonValue),
      },
    });
  },

  delete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.delete({ where: { id } });
  },

  /** The system-managed equity account balance adjustments offset against. */
  findAdjustmentOffsetAccount(
    ledgerId: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.bookAccount.findFirst({
      where: {
        ledgerId,
        type: "equity",
        status: "active",
        flags: { has: ADJUSTMENT_OFFSET_ACCOUNT_FLAG },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  },

  findFirstActiveByType(
    ledgerId: string,
    type: string,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.bookAccount.findFirst({
      where: { ledgerId, type, status: "active" },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  },

  countLines(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.journalLine.count({ where: { accountId: id } });
  },

  countChildren(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.count({ where: { parentId: id } });
  },

  countActiveChildren(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.bookAccount.count({
      where: { parentId: id, status: "active" },
    });
  },

  /**
   * Active expense/income category LEAF paths for the recognition prompt —
   * the selectable range is leaves only, but each leaf is listed as its
   * full "/"-joined path so same-named leaves under different parents stay
   * distinguishable. Segments are STABLE KEYS, not display names: seeded
   * i18n accounts render their localized label client-side and carry no
   * server-side name, so the path uses `code ?? name` — the permanent
   * `code` for built-in categories (e.g. "food/meals"), the current name
   * for user-created ones. The list is uncut — every active leaf the
   * ledger has. The iOS side re-walks each segment against code OR name
   * (`CategoryPathResolver` in QianlaiShared/BookkeepingModels.swift) —
   * change the two contracts together.
   */
  async listRecognitionCategoryPaths(
    ledgerId: string,
    tx: Prisma.TransactionClient = prisma,
  ): Promise<{ expense: string[]; income: string[] }> {
    const accounts = await tx.bookAccount.findMany({
      where: {
        ledgerId,
        status: "active",
        type: { in: ["expense", "income"] },
      },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        parentId: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const pathOf = (account: (typeof accounts)[number]): string | null => {
      const segments: string[] = [];
      const visited = new Set<string>();
      let cursor: (typeof accounts)[number] | undefined = account;
      while (cursor) {
        if (visited.has(cursor.id)) return null; // corrupt tree, cycle guard
        visited.add(cursor.id);
        // Seeded accounts carry a permanent `code` and no name (the
        // localized label lives client-side), so only a code-less AND
        // name-less node breaks the path.
        const segment = cursor.code ?? cursor.name;
        if (segment === null) return null;
        segments.unshift(segment);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      return segments.join("/");
    };
    const paths = (type: string) => {
      const out: string[] = [];
      for (const account of accounts) {
        if (account.type !== type) continue;
        const hasChildren = accounts.some(
          (other) => other.parentId === account.id,
        );
        if (hasChildren) continue;
        const path = pathOf(account);
        if (path !== null) out.push(path);
      }
      return out;
    };
    return { expense: paths("expense"), income: paths("income") };
  },
};
