import { randomBytes } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import { prisma } from "#lib/db";
import { redeemCodeRepository } from "./redeem-code.repository";
import { userCreditRepository } from "./user-credit.repository";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function ensureUniqueCode(code: string): Promise<string> {
  const existing = await redeemCodeRepository.findByCode(code);
  if (!existing) return code;
  return ensureUniqueCode(generateCode());
}

export async function listRedeemCodes(limit?: number, offset?: number) {
  const [codes, total] = await Promise.all([
    redeemCodeRepository.findMany(limit, offset),
    redeemCodeRepository.count(),
  ]);
  return { codes, total };
}

export async function createRedeemCode(data: {
  credit: number;
  expiresAt?: Date;
}) {
  const code = await ensureUniqueCode(generateCode());
  return redeemCodeRepository.create({
    code,
    credit: data.credit,
    expiresAt: data.expiresAt,
  });
}

export async function updateRedeemCode(
  id: string,
  data: {
    credit?: number;
    enabled?: boolean;
    expiresAt?: Date | null;
  },
) {
  const code = await redeemCodeRepository.findById(id);
  if (!code) {
    throw new HTTPException(404, { message: "Redeem code not found" });
  }
  return redeemCodeRepository.update(id, data);
}

export async function deleteRedeemCode(id: string) {
  const code = await redeemCodeRepository.findById(id);
  if (!code) {
    throw new HTTPException(404, { message: "Redeem code not found" });
  }
  return redeemCodeRepository.delete(id);
}

export async function redeemCode(userId: string, codeStr: string) {
  const code = await redeemCodeRepository.findByCode(codeStr);
  if (!code) {
    throw new HTTPException(404, { message: "Redeem code not found" });
  }
  if (!code.enabled) {
    throw new HTTPException(400, { message: "Redeem code is disabled" });
  }
  if (code.expiresAt && code.expiresAt < new Date()) {
    throw new HTTPException(400, { message: "Redeem code has expired" });
  }
  if (code.status === "used") {
    throw new HTTPException(400, {
      message: "This redeem code has already been used",
    });
  }

  await prisma.$transaction(async (tx) => {
    const result = await redeemCodeRepository.markUsed(code.id, tx);
    if (result.count !== 1) {
      throw new HTTPException(400, {
        message: "This redeem code has already been used",
      });
    }
    await userCreditRepository.adjustBalance(
      userId,
      {
        amount: code.credit,
        type: "redeem",
        referenceType: "redeem_code",
        referenceId: code.id,
        description: `Redeemed code ${code.code}`,
      },
      tx,
    );
  });

  const userCredit = await userCreditRepository.findByUserId(userId);
  return { credit: code.credit, balance: userCredit?.balance ?? code.credit };
}

export async function getUserCredit(userId: string) {
  const credit = await userCreditRepository.ensure(userId);
  return credit;
}

export async function assertUserHasCredit(userId: string) {
  const credit = await userCreditRepository.ensure(userId);
  if (credit.balance <= 0) {
    throw new HTTPException(402, {
      message:
        "Insufficient credit balance. Redeem a code before using AI Agent.",
    });
  }
  return credit;
}

export async function listUserCredits(limit?: number, offset?: number) {
  const [credits, total] = await Promise.all([
    userCreditRepository.findManyWithUser(limit, offset),
    userCreditRepository.count(),
  ]);
  return { credits, total };
}

const USER_LEDGER_TYPES = ["ai_usage", "redeem", "seed"];

export async function listUserCreditLedger(
  userId: string,
  limit?: number,
  offset?: number,
) {
  const [entries, total] = await Promise.all([
    userCreditRepository.findLedgerByUserId(userId, limit, offset),
    userCreditRepository.countLedgerByUserId(userId),
  ]);
  return { entries, total };
}

export async function listMyCreditLedger(
  userId: string,
  limit?: number,
  offset?: number,
) {
  const [entries, total] = await Promise.all([
    userCreditRepository.findLedgerByUserId(
      userId,
      limit,
      offset,
      USER_LEDGER_TYPES,
    ),
    userCreditRepository.countLedgerByUserId(userId, USER_LEDGER_TYPES),
  ]);
  return { entries, total };
}
