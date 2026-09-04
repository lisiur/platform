import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
}));

vi.mock("../ledger.repository", () => ({
  ledgerRepository: {
    findById: vi.fn(),
    update: vi.fn(),
  },
  lockLedgerRow: vi.fn(),
}));

vi.mock("../ledger-member.repository", () => ({
  ledgerMemberRepository: {
    findMembership: vi.fn(),
    listByLedger: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../account.repository", () => ({
  accountRepository: {
    listByLedger: vi.fn(),
  },
}));

vi.mock("../project.repository", () => ({
  projectRepository: {
    findById: vi.fn(),
    findByIdWithMembers: vi.fn(),
    listByLedger: vi.fn(),
    listByIds: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countEntries: vi.fn(),
  },
}));

vi.mock("../project-member.repository", () => ({
  projectMemberRepository: {
    findMembership: vi.fn(),
    listByProject: vi.fn(),
    listProjectIdsForUser: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteAllInLedger: vi.fn(),
    countForUser: vi.fn(),
  },
}));

vi.mock("../journal.repository", () => ({
  journalRepository: {
    listByProject: vi.fn(),
  },
}));

import { journalRepository } from "../journal.repository";
import { ledgerRepository } from "../ledger.repository";
import { ledgerMemberRepository } from "../ledger-member.repository";
import { projectRepository } from "../project.repository";
import {
  addProjectMember,
  createProject,
  deleteProject,
  leaveProject,
  listProjects,
  projectReport,
  removeProjectMember,
  updateProject,
} from "../project.service";
import { projectMemberRepository } from "../project-member.repository";

const mockLedgerRepo = ledgerRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
};
const mockMemberRepo = ledgerMemberRepository as unknown as {
  findMembership: ReturnType<typeof vi.fn>;
  listByLedger: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
const mockProjectRepo = projectRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
  findByIdWithMembers: ReturnType<typeof vi.fn>;
  listByLedger: ReturnType<typeof vi.fn>;
  listByIds: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  countEntries: ReturnType<typeof vi.fn>;
};
const mockProjectMemberRepo = projectMemberRepository as unknown as {
  findMembership: ReturnType<typeof vi.fn>;
  listByProject: ReturnType<typeof vi.fn>;
  listProjectIdsForUser: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  countForUser: ReturnType<typeof vi.fn>;
};
const mockJournalRepo = journalRepository as unknown as {
  listByProject: ReturnType<typeof vi.fn>;
};

const baseLedger = {
  id: "led-1",
  ownerId: "user-owner",
  name: "Family",
  status: "active",
  lastEntryNo: 0,
};

const baseProject = {
  id: "proj-1",
  ledgerId: "led-1",
  name: "Kyoto Trip",
  description: null,
  status: "active",
  startDate: null,
  endDate: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-08-01T00:00:00Z"),
};

function member(userId: string) {
  return {
    id: `pm-${userId}`,
    projectId: "proj-1",
    userId,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    user: {
      id: userId,
      name: userId === "user-a" ? "Alice" : "Bob",
      email: `${userId}@example.com`,
      avatar: null,
    },
  };
}

async function expectStatus(
  fn: () => Promise<unknown> | unknown,
  status: number,
): Promise<void> {
  const err = await Promise.resolve(fn()).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HTTPException);
  expect((err as HTTPException).status).toBe(status);
}

describe("createProject", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    mockProjectRepo.countEntries.mockResolvedValue(0);
  });

  it("creates the project and adds the creator as first member", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "owner" });
    mockProjectRepo.create.mockResolvedValue(baseProject);
    mockProjectRepo.findByIdWithMembers.mockResolvedValue({
      ...baseProject,
      members: [member("user-owner")],
    });
    const result = await createProject("user-owner", "led-1", {
      name: "Kyoto Trip",
    });
    expect(mockProjectMemberRepo.create).toHaveBeenCalledWith(
      { projectId: "proj-1", userId: "user-owner" },
      expect.anything(),
    );
    expect(result.members).toHaveLength(1);
    expect(result.members[0].userId).toBe("user-owner");
    expect(result.entryCount).toBe(0);
  });

  it("rejects viewers and guests (403)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "viewer" });
    await expectStatus(
      () => createProject("user-x", "led-1", { name: "Nope" }),
      403,
    );
    mockMemberRepo.findMembership.mockResolvedValue({ role: "guest" });
    await expectStatus(
      () => createProject("user-x", "led-1", { name: "Nope" }),
      403,
    );
    expect(mockProjectRepo.create).not.toHaveBeenCalled();
  });

  it("rejects a blank name (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "owner" });
    await expectStatus(
      () => createProject("user-owner", "led-1", { name: "   " }),
      400,
    );
  });
});

describe("listProjects", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockProjectRepo.countEntries.mockResolvedValue(3);
  });

  it("guests only receive their own projects", async () => {
    mockProjectMemberRepo.listProjectIdsForUser.mockResolvedValue([
      { projectId: "proj-1" },
    ]);
    mockProjectRepo.listByIds.mockResolvedValue([
      { ...baseProject, members: [member("user-b")] },
    ]);
    const { projects } = await listProjects("user-b", "led-1", "guest");
    expect(mockProjectRepo.listByIds).toHaveBeenCalledWith(["proj-1"]);
    expect(mockProjectRepo.listByLedger).not.toHaveBeenCalled();
    expect(projects).toHaveLength(1);
  });

  it("full roles receive every project", async () => {
    mockProjectRepo.listByLedger.mockResolvedValue([
      { ...baseProject, members: [] },
    ]);
    const { projects } = await listProjects("user-owner", "led-1", "owner");
    expect(mockProjectRepo.listByLedger).toHaveBeenCalledWith("led-1");
    expect(projects).toHaveLength(1);
  });

  it("redacts member emails for non-owner viewers", async () => {
    mockProjectRepo.listByLedger.mockResolvedValue([
      { ...baseProject, members: [member("user-b")] },
    ]);
    const { projects } = await listProjects("user-editor", "led-1", "editor");
    expect(projects[0].members[0].user.email).toBeNull();
  });
});

describe("projectReport settlement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    mockMemberRepo.findMembership.mockResolvedValue({ role: "owner" });
    mockProjectRepo.findById.mockResolvedValue(baseProject);
    mockProjectRepo.findByIdWithMembers.mockResolvedValue({
      ...baseProject,
      members: [member("user-a"), member("user-b")],
    });
    mockProjectMemberRepo.listByProject.mockResolvedValue([
      member("user-a"),
      member("user-b"),
    ]);
  });

  function entry(input: {
    createdById: string;
    /** Who fronted the money; defaults to the creator like the server. */
    paidById?: string;
    lines: Array<{
      account: {
        id: string;
        name: string | null;
        code: string | null;
        type: string;
        sortOrder: number;
        icon: string | null;
      };
      debit: number;
      credit: number;
    }>;
    participants?: string[];
  }) {
    return {
      paidById: input.paidById ?? input.createdById,
      lines: input.lines,
      participants: (input.participants ?? []).map((userId) => ({
        userId,
      })),
    };
  }

  const expenseAccount = {
    id: "acc-food",
    name: "Food",
    code: "food",
    type: "expense",
    sortOrder: 200,
    icon: "🍜",
  };
  const incomeAccount = {
    id: "acc-refund",
    name: "Refund",
    code: "taxRefund",
    type: "income",
    sortOrder: 140,
    icon: "🧾",
  };
  const pocketAccount = {
    id: "acc-pocket",
    name: null,
    code: "defaultAccount",
    type: "asset",
    sortOrder: 5,
    icon: "👛",
  };

  it("splits untagged entries across all members, tagged across the tagged set", async () => {
    mockJournalRepo.listByProject.mockResolvedValue([
      // Alice fronts an untagged 100.00 expense.
      entry({
        createdById: "user-a",
        lines: [
          { account: expenseAccount, debit: 100, credit: 0 },
          { account: pocketAccount, debit: 0, credit: 100 },
        ],
      }),
      // Bob fronts an untagged 30.33 expense (odd cents split 15.17/15.16).
      entry({
        createdById: "user-b",
        lines: [
          { account: expenseAccount, debit: 30.33, credit: 0 },
          { account: pocketAccount, debit: 0, credit: 30.33 },
        ],
      }),
      // Bob receives a 60.00 income tagged to himself only.
      entry({
        createdById: "user-b",
        lines: [
          { account: pocketAccount, debit: 60, credit: 0 },
          { account: incomeAccount, debit: 0, credit: 60 },
        ],
        participants: ["user-b"],
      }),
    ]);

    const report = await projectReport("user-a", "proj-1");

    expect(report.statement.totalExpense).toBe(130.33);
    expect(report.statement.totalIncome).toBe(60);
    expect(report.statement.net).toBe(-70.33);
    expect(report.totals.entries).toBe(3);

    const byUser = new Map(report.settlement.map((r) => [r.userId, r]));
    const alice = byUser.get("user-a");
    const bob = byUser.get("user-b");
    expect(alice).toMatchObject({
      paid: 100,
      share: 65.17, // 50 + 15.17
      balance: 34.83,
    });
    expect(bob).toMatchObject({
      paid: -29.67, // +30.33 expense fronted, −60 income received
      share: 5.16, // 50 + 15.16 − 60
      balance: -34.83,
    });
    // The settlement always nets to zero.
    const net = report.settlement.reduce((acc, r) => acc + r.balance, 0);
    expect(Math.round(net * 100)).toBe(0);
  });

  it("credits the payer, not the creator, when they differ", async () => {
    mockJournalRepo.listByProject.mockResolvedValue([
      // Alice records an untagged 100.00 expense John fronted.
      entry({
        createdById: "user-a",
        paidById: "user-b",
        lines: [
          { account: expenseAccount, debit: 100, credit: 0 },
          { account: pocketAccount, debit: 0, credit: 100 },
        ],
      }),
    ]);

    const report = await projectReport("user-a", "proj-1");

    const byUser = new Map(report.settlement.map((r) => [r.userId, r]));
    expect(byUser.get("user-a")).toMatchObject({ paid: 0, share: 50 });
    expect(byUser.get("user-b")).toMatchObject({ paid: 100, share: 50 });
  });

  it("includes zero-activity members so the table is complete", async () => {
    mockJournalRepo.listByProject.mockResolvedValue([]);
    const report = await projectReport("user-a", "proj-1");
    expect(report.settlement).toHaveLength(2);
    for (const row of report.settlement) {
      expect(row.paid).toBe(0);
      expect(row.share).toBe(0);
      expect(row.balance).toBe(0);
    }
  });

  it("rejects non-members with 404 (no existence leak)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue(null);
    await expectStatus(() => projectReport("user-c", "proj-1"), 404);
  });
});

const archivedLedger = { ...baseLedger, status: "archived" };

describe("updateProject", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    mockProjectRepo.findById.mockResolvedValue(baseProject);
    mockProjectRepo.countEntries.mockResolvedValue(0);
  });

  it("updates the project for an editor", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "editor" });
    mockProjectRepo.update.mockResolvedValue({
      ...baseProject,
      name: "Renamed",
      members: [],
    });
    const result = await updateProject("user-ed", "proj-1", {
      name: "Renamed",
    });
    expect(result.name).toBe("Renamed");
  });

  it("rejects viewers and guests (403)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "viewer" });
    await expectStatus(
      () => updateProject("user-x", "proj-1", { name: "Nope" }),
      403,
    );
    mockMemberRepo.findMembership.mockResolvedValue({ role: "guest" });
    await expectStatus(
      () => updateProject("user-x", "proj-1", { name: "Nope" }),
      403,
    );
    expect(mockProjectRepo.update).not.toHaveBeenCalled();
  });

  it("rejects updating on an archived ledger (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "owner" });
    mockLedgerRepo.findById.mockResolvedValue(archivedLedger);
    await expectStatus(
      () => updateProject("user-owner", "proj-1", { name: "Nope" }),
      400,
    );
    expect(mockProjectRepo.update).not.toHaveBeenCalled();
  });

  it("rejects an inverted date range (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "owner" });
    await expectStatus(
      () =>
        updateProject("user-owner", "proj-1", {
          startDate: new Date("2026-09-01"),
          endDate: new Date("2026-08-01"),
        }),
      400,
    );
  });
});

describe("deleteProject", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    mockProjectRepo.findById.mockResolvedValue(baseProject);
  });

  it("deletes the project for the owner", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "owner" });
    const result = await deleteProject("user-owner", "proj-1");
    expect(result).toEqual({ success: true });
    expect(mockProjectRepo.delete).toHaveBeenCalledWith(
      "proj-1",
      expect.anything(),
    );
  });

  it("rejects non-owners (403)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "editor" });
    await expectStatus(() => deleteProject("user-ed", "proj-1"), 403);
    expect(mockProjectRepo.delete).not.toHaveBeenCalled();
  });

  it("rejects deleting on an archived ledger (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "owner" });
    mockLedgerRepo.findById.mockResolvedValue(archivedLedger);
    await expectStatus(() => deleteProject("user-owner", "proj-1"), 400);
    expect(mockProjectRepo.delete).not.toHaveBeenCalled();
  });
});

describe("addProjectMember", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    mockProjectRepo.findById.mockResolvedValue(baseProject);
  });

  it("adds a ledger member to an active project", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "editor" });
    mockProjectMemberRepo.findMembership.mockResolvedValue(null);
    const result = await addProjectMember("user-ed", "proj-1", "user-other");
    expect(result).toEqual({ success: true });
    expect(mockProjectMemberRepo.create).toHaveBeenCalledWith(
      { projectId: "proj-1", userId: "user-other" },
      expect.anything(),
    );
  });

  it("rejects viewers and guests (403)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "viewer" });
    await expectStatus(
      () => addProjectMember("user-x", "proj-1", "user-other"),
      403,
    );
    expect(mockProjectMemberRepo.create).not.toHaveBeenCalled();
  });

  it("rejects adding on an archived ledger (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "owner" });
    mockLedgerRepo.findById.mockResolvedValue(archivedLedger);
    await expectStatus(
      () => addProjectMember("user-owner", "proj-1", "user-other"),
      400,
    );
    expect(mockProjectMemberRepo.create).not.toHaveBeenCalled();
  });

  it("rejects a target that is not a ledger member (404)", async () => {
    mockMemberRepo.findMembership.mockImplementation(
      (_ledgerId: string, userId: string) =>
        userId === "user-owner"
          ? Promise.resolve({ role: "owner" })
          : Promise.resolve(null),
    );
    mockProjectMemberRepo.findMembership.mockResolvedValue(null);
    await expectStatus(
      () => addProjectMember("user-owner", "proj-1", "user-stranger"),
      404,
    );
  });

  it("rejects a target that is already a project member (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "owner" });
    mockProjectMemberRepo.findMembership.mockResolvedValue({ id: "pm-1" });
    await expectStatus(
      () => addProjectMember("user-owner", "proj-1", "user-other"),
      400,
    );
  });
});

describe("removeProjectMember", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    mockProjectRepo.findById.mockResolvedValue(baseProject);
  });

  it("removes a member from an active project", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "editor" });
    mockProjectMemberRepo.findMembership.mockResolvedValue({ id: "pm-1" });
    mockProjectMemberRepo.countForUser.mockResolvedValue(0);
    const result = await removeProjectMember("user-ed", "proj-1", "user-other");
    expect(result).toEqual({ success: true });
    expect(mockProjectMemberRepo.delete).toHaveBeenCalledWith(
      "proj-1",
      "user-other",
      expect.anything(),
    );
  });

  it("rejects viewers and guests (403)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "viewer" });
    await expectStatus(
      () => removeProjectMember("user-x", "proj-1", "user-other"),
      403,
    );
    expect(mockProjectMemberRepo.delete).not.toHaveBeenCalled();
  });

  it("rejects removing on an archived ledger (400)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "owner" });
    mockLedgerRepo.findById.mockResolvedValue(archivedLedger);
    await expectStatus(
      () => removeProjectMember("user-owner", "proj-1", "user-other"),
      400,
    );
    expect(mockProjectMemberRepo.delete).not.toHaveBeenCalled();
  });

  it("rejects an unknown target (404)", async () => {
    mockMemberRepo.findMembership.mockResolvedValue({ role: "editor" });
    mockProjectMemberRepo.findMembership.mockResolvedValue(null);
    await expectStatus(
      () => removeProjectMember("user-ed", "proj-1", "user-stranger"),
      404,
    );
  });
});

describe("leaveProject", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLedgerRepo.findById.mockResolvedValue(baseLedger);
    mockProjectRepo.findById.mockResolvedValue(baseProject);
  });

  it("removes the actor from the project", async () => {
    mockProjectMemberRepo.findMembership.mockResolvedValue({ id: "pm-1" });
    mockProjectMemberRepo.countForUser.mockResolvedValue(0);
    const result = await leaveProject("user-other", "proj-1");
    expect(result).toEqual({ success: true });
    expect(mockProjectMemberRepo.delete).toHaveBeenCalledWith(
      "proj-1",
      "user-other",
      expect.anything(),
    );
  });

  it("rejects leaving on an archived ledger (400)", async () => {
    mockLedgerRepo.findById.mockResolvedValue(archivedLedger);
    await expectStatus(() => leaveProject("user-other", "proj-1"), 400);
    expect(mockProjectMemberRepo.delete).not.toHaveBeenCalled();
  });

  it("rejects an actor who is not a project member (404)", async () => {
    mockProjectMemberRepo.findMembership.mockResolvedValue(null);
    await expectStatus(() => leaveProject("user-stranger", "proj-1"), 404);
  });
});
