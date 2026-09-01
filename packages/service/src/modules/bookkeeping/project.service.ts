import { HTTPException } from "hono/http-exception";
import type { Prisma } from "#generated/prisma/client";
import { prisma } from "#lib/db";
import { userLookupRepository } from "#modules/identity/public";
import { assertLedgerWritable, requireProjectAccess } from "./access";
import { journalRepository } from "./journal.repository";
import { ledgerRepository, lockLedgerRow } from "./ledger.repository";
import { ledgerMemberRepository } from "./ledger-member.repository";
import { type ProjectStatus, projectRepository } from "./project.repository";
import { projectMemberRepository } from "./project-member.repository";

function assertProjectWritable(project: { status: string }): void {
  if (project.status !== "active") {
    throw new HTTPException(400, { message: "This project is archived" });
  }
}

export type ProjectInput = {
  name: string;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
};

export type ProjectUpdateInput = Partial<ProjectInput> & {
  status?: ProjectStatus;
};

/** Shape a project row (with members included) for API responses. */
function serializeProject(
  project: Awaited<ReturnType<typeof projectRepository.create>>,
  entryCount: number,
) {
  return {
    id: project.id,
    ledgerId: project.ledgerId,
    name: project.name,
    description: project.description,
    status: project.status as "active" | "archived",
    startDate: project.startDate,
    endDate: project.endDate,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    members: project.members.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      userId: m.userId,
      createdAt: m.createdAt,
      user: m.user,
    })),
    entryCount,
  };
}

/** Same redaction policy as `listMembers`: only the ledger owner sees emails. */
function redactProjectEmails<
  T extends {
    members: Array<{ user?: { email: string | null } | null }>;
  },
>(project: T, showEmail: boolean): T {
  if (showEmail) return project;
  return {
    ...project,
    members: project.members.map((m) => ({
      ...m,
      user: m.user ? { ...m.user, email: null } : m.user,
    })),
  };
}

/**
 * Creates a project and adds the creator as its first member — the member
 * list defines the settlement participant set, so the creator must be on it
 * from the start. Runs under the ledger row lock like every ledger writer.
 */
export async function createProject(
  userId: string,
  ledgerId: string,
  data: ProjectInput,
) {
  if (!data.name?.trim()) {
    throw new HTTPException(400, { message: "Project name is required" });
  }
  return prisma.$transaction(async (tx) => {
    await lockLedgerRow(tx, ledgerId);
    const ledger = await ledgerRepository.findById(ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const membership = await ledgerMemberRepository.findMembership(
      ledgerId,
      userId,
      tx,
    );
    if (
      !membership ||
      membership.role === "guest" ||
      membership.role === "viewer"
    ) {
      throw new HTTPException(403, {
        message: "This action requires the editor role or higher",
      });
    }
    const project = await projectRepository.create(
      {
        ledgerId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
      },
      tx,
    );
    await projectMemberRepository.create({ projectId: project.id, userId }, tx);
    const withCreator = await projectRepository.findByIdWithMembers(
      project.id,
      tx,
    );
    return serializeProject(withCreator ?? project, 0);
  });
}

/**
 * Full roles see every project of the ledger; guests only see the projects
 * they belong to (their entry scope is exactly these ids).
 */
type ProjectWithMembers = Awaited<
  ReturnType<typeof projectRepository.listByLedger>
>[number];

export async function listProjects(
  userId: string,
  ledgerId: string,
  viewerRole: string,
) {
  let projects: ProjectWithMembers[];
  if (viewerRole === "guest") {
    const rows = await projectMemberRepository.listProjectIdsForUser(
      ledgerId,
      userId,
    );
    projects = await projectRepository.listByIds(rows.map((r) => r.projectId));
  } else {
    projects = await projectRepository.listByLedger(ledgerId);
  }
  const counts = await Promise.all(
    projects.map((p) => projectRepository.countEntries(p.id)),
  );
  const showEmail = viewerRole === "owner";
  return {
    projects: projects.map((p, i) =>
      redactProjectEmails(serializeProject(p, counts[i]), showEmail),
    ),
  };
}

export async function getProject(
  _userId: string,
  projectId: string,
  viewerRole: string,
) {
  const project = await projectRepository.findByIdWithMembers(projectId);
  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  const entryCount = await projectRepository.countEntries(projectId);
  return redactProjectEmails(
    serializeProject(project, entryCount),
    viewerRole === "owner",
  );
}

/** Renames / re-dates / (un)archives a project. Editors and above. */
export async function updateProject(
  userId: string,
  projectId: string,
  data: ProjectUpdateInput,
) {
  if (data.name !== undefined && !data.name.trim()) {
    throw new HTTPException(400, { message: "Project name is required" });
  }
  if (
    data.startDate &&
    data.endDate &&
    data.startDate.getTime() > data.endDate.getTime()
  ) {
    throw new HTTPException(400, {
      message: "Project start date must not be after its end date",
    });
  }
  return prisma.$transaction(async (tx) => {
    const project = await projectRepository.findById(projectId, tx);
    if (!project) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    await lockLedgerRow(tx, project.ledgerId);
    const ledger = await ledgerRepository.findById(project.ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const membership = await ledgerMemberRepository.findMembership(
      project.ledgerId,
      userId,
      tx,
    );
    if (
      !membership ||
      membership.role === "guest" ||
      membership.role === "viewer"
    ) {
      throw new HTTPException(403, {
        message: "This action requires the editor role or higher",
      });
    }
    const updated = await projectRepository.update(
      projectId,
      {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
        ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      tx,
    );
    return serializeProject(
      updated,
      await projectRepository.countEntries(projectId, tx),
    );
  });
}

/**
 * Hard-deletes a project (owner only). Entries survive unassigned — the FK
 * is SetNull — and the project's share codes cascade away with it.
 */
export async function deleteProject(userId: string, projectId: string) {
  await prisma.$transaction(async (tx) => {
    const project = await projectRepository.findById(projectId, tx);
    if (!project) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    await lockLedgerRow(tx, project.ledgerId);
    const ledger = await ledgerRepository.findById(project.ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const membership = await ledgerMemberRepository.findMembership(
      project.ledgerId,
      userId,
      tx,
    );
    if (membership?.role !== "owner") {
      throw new HTTPException(403, {
        message: "Only the ledger owner can perform this action",
      });
    }
    await projectRepository.delete(projectId, tx);
  });
  return { success: true as const };
}

/**
 * Adds an existing ledger member to the project (editor+). Outsiders join
 * via project share codes — there is no user lookup to invite by address.
 */
export async function addProjectMember(
  actingUserId: string,
  projectId: string,
  targetUserId: string,
) {
  await prisma.$transaction(async (tx) => {
    const project = await projectRepository.findById(projectId, tx);
    if (!project) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    await lockLedgerRow(tx, project.ledgerId);
    const ledger = await ledgerRepository.findById(project.ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    assertProjectWritable(project);
    const acting = await ledgerMemberRepository.findMembership(
      project.ledgerId,
      actingUserId,
      tx,
    );
    if (!acting || acting.role === "guest" || acting.role === "viewer") {
      throw new HTTPException(403, {
        message: "This action requires the editor role or higher",
      });
    }
    const target = await ledgerMemberRepository.findMembership(
      project.ledgerId,
      targetUserId,
      tx,
    );
    if (!target) {
      throw new HTTPException(404, {
        message:
          "User is not a member of this ledger; share a project invite code instead",
      });
    }
    const existing = await projectMemberRepository.findMembership(
      projectId,
      targetUserId,
      tx,
    );
    if (existing) {
      throw new HTTPException(400, {
        message: "User is already a member of this project",
      });
    }
    await projectMemberRepository.create(
      { projectId, userId: targetUserId },
      tx,
    );
  });
  return { success: true as const };
}

/**
 * After dropping a member's project row, a guest left with zero projects in
 * the ledger has nothing left to see — remove their ledger membership too
 * (same transaction) instead of leaving a dangling scope-less guest.
 */
async function dropProjectMembership(
  tx: Prisma.TransactionClient,
  projectId: string,
  ledgerId: string,
  targetUserId: string,
) {
  await projectMemberRepository.delete(projectId, targetUserId, tx);
  const target = await ledgerMemberRepository.findMembership(
    ledgerId,
    targetUserId,
    tx,
  );
  if (target?.role === "guest") {
    const remaining = await projectMemberRepository.countForUser(
      ledgerId,
      targetUserId,
      tx,
    );
    if (remaining === 0) {
      await ledgerMemberRepository.delete(ledgerId, targetUserId, tx);
    }
  }
}

/** Removes a member from the project (editor+). */
export async function removeProjectMember(
  actingUserId: string,
  projectId: string,
  targetUserId: string,
) {
  await prisma.$transaction(async (tx) => {
    const project = await projectRepository.findById(projectId, tx);
    if (!project) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    await lockLedgerRow(tx, project.ledgerId);
    const ledger = await ledgerRepository.findById(project.ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const acting = await ledgerMemberRepository.findMembership(
      project.ledgerId,
      actingUserId,
      tx,
    );
    if (!acting || acting.role === "guest" || acting.role === "viewer") {
      throw new HTTPException(403, {
        message: "This action requires the editor role or higher",
      });
    }
    const existing = await projectMemberRepository.findMembership(
      projectId,
      targetUserId,
      tx,
    );
    if (!existing) {
      throw new HTTPException(404, { message: "Project member not found" });
    }
    await dropProjectMembership(tx, projectId, project.ledgerId, targetUserId);
  });
  return { success: true as const };
}

/** Leaves a project. Guests losing their last project leave the ledger. */
export async function leaveProject(userId: string, projectId: string) {
  await prisma.$transaction(async (tx) => {
    const project = await projectRepository.findById(projectId, tx);
    if (!project) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    await lockLedgerRow(tx, project.ledgerId);
    const ledger = await ledgerRepository.findById(project.ledgerId, tx);
    if (!ledger) {
      throw new HTTPException(404, { message: "Ledger not found" });
    }
    assertLedgerWritable(ledger);
    const existing = await projectMemberRepository.findMembership(
      projectId,
      userId,
      tx,
    );
    if (!existing) {
      throw new HTTPException(404, {
        message: "You are not a member of this project",
      });
    }
    await dropProjectMembership(tx, projectId, project.ledgerId, userId);
  });
  return { success: true as const };
}

type SettlementRow = {
  userId: string;
  name: string;
  avatar: string | null;
  /** Signed cents the member fronted (expenses) or received (income). */
  paidCents: number;
  /** Signed cents of fair share accrued to the member. */
  shareCents: number;
};

/**
 * The project page report: an income/expense statement over the project's
 * entries plus an equal-split settlement suggestion.
 *
 * Split semantics (as agreed): an entry tagged with participants splits
 * across exactly those people; an untagged entry splits across ALL current
 * project members. Per entry, `value = expense portion − income portion`
 * (positive = money out of the group): the creator fronted it, every split
 * member owes their share of it. Splits run in integer cents with the
 * remainder distributed to the earliest sorted member ids, so shares always
 * sum to the entry's exact value and the settlement nets to zero.
 */
export async function projectReport(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId, "guest");
  const [project, members] = await Promise.all([
    projectRepository.findByIdWithMembers(projectId),
    projectMemberRepository.listByProject(projectId),
  ]);
  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  const entries = await journalRepository.listByProject(projectId);

  const memberUserIds = members.map((m) => m.userId).sort();
  const memberInfo = new Map(
    members.map((m) => [
      m.userId,
      { name: m.user?.name ?? m.userId, avatar: m.user?.avatar ?? null },
    ]),
  );
  // Current members' names come from the membership include above; entries
  // can still reference people outside the current member list: a creator
  // who has left the ledger entirely (only account deletion clears
  // createdById), or a tagged participant removed from this project who
  // remains a ledger member. Resolve those straight from the User table so
  // settlement rows render real names and avatars, never raw ids.
  const referencedUserIds = new Set<string>();
  for (const entry of entries) {
    if (entry.createdById) referencedUserIds.add(entry.createdById);
    for (const p of entry.participants) {
      referencedUserIds.add(p.ledgerMember.userId);
    }
  }
  const departedUserIds = [...referencedUserIds].filter(
    (id) => !memberInfo.has(id),
  );
  if (departedUserIds.length > 0) {
    const departedUsers =
      await userLookupRepository.findManyPublicByIds(departedUserIds);
    for (const user of departedUsers) {
      memberInfo.set(user.id, { name: user.name, avatar: user.avatar });
    }
  }
  const settlement = new Map<string, SettlementRow>();
  const rowFor = (userId: string): SettlementRow => {
    let row = settlement.get(userId);
    if (!row) {
      const info = memberInfo.get(userId) ?? { name: userId, avatar: null };
      row = {
        userId,
        name: info.name,
        avatar: info.avatar,
        paidCents: 0,
        shareCents: 0,
      };
      settlement.set(userId, row);
    }
    return row;
  };
  // Every current member appears even at zero, so the table is complete.
  for (const id of memberUserIds) rowFor(id);

  const accountSums = new Map<
    string,
    {
      debit: number;
      credit: number;
      account: {
        id: string;
        name: string | null;
        code: string | null;
        type: string;
        sortOrder: number;
        icon: string | null;
      };
    }
  >();
  let totalExpenseCents = 0;
  let totalIncomeCents = 0;

  for (const entry of entries) {
    let expenseCents = 0;
    let incomeCents = 0;
    for (const line of entry.lines) {
      const account = accountSums.get(line.account.id) ?? {
        debit: 0,
        credit: 0,
        account: {
          id: line.account.id,
          name: line.account.name,
          code: line.account.code,
          type: line.account.type,
          sortOrder: line.account.sortOrder,
          icon: line.account.icon,
        },
      };
      const debitCents = Math.round(Number(line.debit) * 100);
      const creditCents = Math.round(Number(line.credit) * 100);
      account.debit += debitCents;
      account.credit += creditCents;
      accountSums.set(line.account.id, account);
      if (line.account.type === "expense") {
        // Debit-normal: an increase (debit) is money spent.
        expenseCents += debitCents - creditCents;
      } else if (line.account.type === "income") {
        // Credit-normal: an increase (credit) is money received.
        incomeCents += creditCents - debitCents;
      }
    }
    totalExpenseCents += expenseCents;
    totalIncomeCents += incomeCents;

    const valueCents = expenseCents - incomeCents;
    if (entry.createdById) {
      rowFor(entry.createdById).paidCents += valueCents;
    }

    const splitUserIds = entry.participants.length
      ? [
          ...new Set(entry.participants.map((p) => p.ledgerMember.userId)),
        ].sort()
      : memberUserIds;
    const n = splitUserIds.length;
    if (n > 0 && valueCents !== 0) {
      const base = Math.floor(valueCents / n);
      const remainder = valueCents - base * n;
      splitUserIds.forEach((splitUserId, i) => {
        rowFor(splitUserId).shareCents += base + (i < remainder ? 1 : 0);
      });
    }
  }

  const cents = (value: number) => Math.round(value) / 100;
  const statementRow = ({
    account,
    debit,
    credit,
  }: {
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
  }) => {
    const balance =
      account.type === "expense" ? debit - credit : credit - debit;
    return {
      id: account.id,
      name: account.name,
      code: account.code,
      type: account.type,
      sortOrder: account.sortOrder,
      balance: cents(balance),
    };
  };
  const accountRows = [...accountSums.values()];
  const income = accountRows
    .filter(({ account }) => account.type === "income")
    .map(statementRow)
    .filter((r) => r.balance !== 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const expense = accountRows
    .filter(({ account }) => account.type === "expense")
    .map(statementRow)
    .filter((r) => r.balance !== 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const rows = [...settlement.values()].map((row) => ({
    userId: row.userId,
    name: row.name,
    avatar: row.avatar,
    paid: cents(row.paidCents),
    share: cents(row.shareCents),
    /** Positive = is owed; negative = owes the group. */
    balance: cents(row.paidCents - row.shareCents),
  }));

  return {
    project: {
      id: project.id,
      ledgerId: project.ledgerId,
      name: project.name,
      status: project.status as "active" | "archived",
      startDate: project.startDate,
      endDate: project.endDate,
    },
    statement: {
      income,
      expense,
      totalIncome: cents(totalIncomeCents),
      totalExpense: cents(totalExpenseCents),
      net: cents(totalIncomeCents - totalExpenseCents),
    },
    settlement: rows.sort((a, b) => b.balance - a.balance),
    totals: { entries: entries.length },
  };
}
