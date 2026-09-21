import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: { bookAccount: { findMany: vi.fn() } },
}));

vi.mock("#modules/agent/agent-resolution.service", () => ({
  resolveAgentModel: vi.fn(),
}));

vi.mock("#modules/agent/tracked-ai-call", () => ({
  executeTrackedAiCall: vi.fn(),
}));

vi.mock("#modules/billing/billing.service", () => ({
  BILLING_RESOURCE_AI_AGENT: "ai_agent",
  resolveBilling: vi.fn(),
}));

vi.mock("#lib/ai-agent/provider-adapter", () => ({
  createProviderModel: vi.fn(() => ({ stub: true })),
  buildDisableThinkingOptions: vi.fn(() => ({})),
}));

vi.mock("ai", () => ({ generateObject: vi.fn() }));

import { generateObject } from "ai";
import { prisma } from "#lib/db";
import { resolveAgentModel } from "#modules/agent/agent-resolution.service";
import { executeTrackedAiCall } from "#modules/agent/tracked-ai-call";
import { resolveBilling } from "#modules/billing/billing.service";
import {
  buildRecognitionPrompt,
  listLedgerCategoryPaths,
  recognizeScreenshot,
  screenshotRecognitionSchema,
} from "../recognize.service";
import { collectRecognitionTiles } from "../routes/journal-entry/recognizeScreenshot";

const findMany = vi.mocked(prisma.bookAccount.findMany);
const resolveAgentModelMock = vi.mocked(resolveAgentModel);
const executeTrackedAiCallMock = vi.mocked(executeTrackedAiCall);
const resolveBillingMock = vi.mocked(resolveBilling);
const generateObjectMock = vi.mocked(generateObject);

function account(
  id: string,
  type: string,
  name: string | null,
  parentId: string | null,
) {
  return { id, type, name, parentId, sortOrder: 0 };
}

const resolvedRuntime = {
  agent: {
    id: "agent-1",
    systemPrompt: "SYS",
    reasoning: null,
    maxSteps: 1,
    temperature: null,
  },
  subAgent: { label: "Receipt Recognition", modelId: "deepseek-v4-flash" },
  allowedApis: [],
  endpoint: {
    aiAdapter: "openai_compatible",
    baseUrl: "https://api.deepseek.com",
    apiKey: "k",
    modelId: "deepseek-v4-flash",
  },
  aiModelId: "m1",
  accountId: "a1",
  accountConcurrencyLimit: 4,
  pricing: null,
  currency: "CNY",
} as const;

const fixtureRecognition = {
  recognized: true,
  kind: "expense" as const,
  amount: 12.5,
  occurredAt: "2026-09-21T14:32:00",
  merchant: "盒马",
  memo: "生鲜订单",
  categoryName: "餐饮",
  confidence: "high" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveBillingMock.mockResolvedValue({
    billingType: "per_call",
    priceAmount: 1,
    priceUnit: "credit",
    status: "active",
  } as never);
  resolveAgentModelMock.mockResolvedValue(
    resolvedRuntime as unknown as Awaited<ReturnType<typeof resolveAgentModel>>,
  );
  executeTrackedAiCallMock.mockImplementation(
    async ({ fn }: { fn: () => Promise<{ result: unknown }> }) =>
      (await fn()).result as never,
  );
});

describe("listLedgerCategoryPaths", () => {
  it("lists leaves as full slash-joined paths, unnamed branches dropped", async () => {
    findMany.mockResolvedValue([
      account("food", "expense", "食品", null),
      account("meal", "expense", "餐饮", "food"),
      // 同名叶子 under different parents — the path is the disambiguator.
      account("apparel", "expense", "服饰", null),
      account("clothes", "expense", "衣服", "apparel"),
      account("kids", "expense", "育儿", null),
      account("kidsclothes", "expense", "衣服", "kids"),
      // An unnamed (seeded i18n) parent breaks the path → leaf dropped.
      account("coded", "expense", null, null),
      account("under-coded", "expense", "孤儿", "coded"),
      account("pocket", "asset", "现金", null),
      account("salary", "income", "工资", null),
    ] as never);
    // The status filter lives in the query (asserted below); the service
    // trusts it and only applies leaf/path/cap logic here.
    const paths = await listLedgerCategoryPaths("ledger-1");
    expect(paths.expense).toEqual(["食品/餐饮", "服饰/衣服", "育儿/衣服"]);
    expect(paths.income).toEqual(["工资"]);
  });

  it("caps each kind at 100 names", async () => {
    const rows = Array.from({ length: 130 }, (_, i) =>
      account(`e${i}`, "expense", `分类${i}`, null),
    );
    rows.push(account("inc", "income", "工资", null));
    findMany.mockResolvedValue(rows as never);

    const paths = await listLedgerCategoryPaths("ledger-1");
    expect(paths.expense).toHaveLength(100);
    expect(paths.income).toEqual(["工资"]);
  });

  it("queries only active expense/income accounts of the ledger", async () => {
    findMany.mockResolvedValue([]);
    await listLedgerCategoryPaths("ledger-1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ledgerId: "ledger-1",
          status: "active",
          type: { in: ["expense", "income"] },
        },
      }),
    );
  });
});

describe("buildRecognitionPrompt", () => {
  it("leads with the tiles preamble and embeds both category lists", () => {
    const prompt = buildRecognitionPrompt({
      expense: ["餐饮", "服饰/衣服"],
      income: ["工资"],
    });
    expect(prompt).toContain("consecutive vertical tiles");
    expect(prompt).toContain("treat them as one single document");
    expect(prompt).toContain("- 餐饮");
    expect(prompt).toContain("- 服饰/衣服");
    expect(prompt).toContain("- 工资");
    // Alternates contract is spelled out for the json_object-mode model.
    expect(prompt).toContain("amountAlternatives");
    expect(prompt).toContain("categoryAlternatives");
    expect(prompt).toContain('"categoryAlternatives":[]');
  });

  it("renders empty lists as (none)", () => {
    const prompt = buildRecognitionPrompt({ expense: [], income: [] });
    expect(prompt).toContain("Expense categories:\n(none)");
    expect(prompt).toContain("Income categories:\n(none)");
  });

  it("keeps the no-transaction path inside the JSON contract", () => {
    const prompt = buildRecognitionPrompt({ expense: [], income: [] });
    // The no-transaction rule nulls everything, so the confidence rule must
    // name null too, and the JSON-only demand must survive the miss — a
    // non-receipt image once drew prose out of the model (prod 502).
    expect(prompt).toContain("every other field to null");
    expect(prompt).toContain("null when recognized is false");
    expect(prompt).toContain("MUST still reply with the JSON object");
  });
});

describe("screenshotRecognitionSchema", () => {
  it("accepts the no-transaction payload — every field nulled, confidence included", () => {
    // The prod 502 regression: the prompt tells the model to null every
    // field when nothing is recognized, so the schema must accept exactly
    // that instead of rejecting the model's own contract.
    const parsed = screenshotRecognitionSchema.parse({
      recognized: false,
      kind: null,
      amount: null,
      occurredAt: null,
      merchant: null,
      memo: null,
      categoryName: null,
      confidence: null,
    });
    expect(parsed).toMatchObject({ recognized: false, confidence: null });
    expect(parsed.amountAlternatives).toEqual([]);
    expect(parsed.categoryAlternatives).toEqual([]);
  });
});

describe("recognizeScreenshot", () => {
  it("resolves the vision-capable agent and passes ordered tiles", async () => {
    findMany.mockResolvedValue([]);
    generateObjectMock.mockResolvedValue({
      object: fixtureRecognition,
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: "stop",
    } as never);

    const result = await recognizeScreenshot({
      userId: "user-1",
      ledgerId: "ledger-1",
      tiles: [
        { data: Buffer.from("a"), mediaType: "image/jpeg" },
        { data: Buffer.from("b"), mediaType: "image/png" },
      ],
    });

    expect(resolveAgentModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentCode: "qianlai_receipt",
        subAgent: "default",
        principal: { type: "user", id: "user-1" },
        requireCapability: "vision",
      }),
    );
    expect(executeTrackedAiCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        resolved: resolvedRuntime,
        billing: expect.objectContaining({ billingType: "per_call" }),
      }),
    );

    const call = generateObjectMock.mock.calls[0]?.[0] as {
      messages: Array<{ content: unknown[] }>;
    };
    const content = call.messages[0]?.content as Array<Record<string, unknown>>;
    expect(content[0]?.type).toBe("text");
    expect(content).toHaveLength(3);
    expect(content[1]).toMatchObject({ type: "file", mediaType: "image/jpeg" });
    expect(content[2]).toMatchObject({ type: "file", mediaType: "image/png" });

    // Defaults fill in when the model omits the alternate arrays.
    expect(result).toEqual({
      ...fixtureRecognition,
      amountAlternatives: [],
      categoryAlternatives: [],
    });
  });

  it("propagates billing 402 untouched", async () => {
    findMany.mockResolvedValue([]);
    executeTrackedAiCallMock.mockImplementation(() => {
      throw new HTTPException(402, { message: "Insufficient credit balance" });
    });

    await expect(
      recognizeScreenshot({
        userId: "user-1",
        ledgerId: "ledger-1",
        tiles: [{ data: Buffer.from("a"), mediaType: "image/jpeg" }],
      }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it("maps provider failures to 502", async () => {
    findMany.mockResolvedValue([]);
    executeTrackedAiCallMock.mockImplementation(() => {
      throw new Error("model exploded");
    });

    await expect(
      recognizeScreenshot({
        userId: "user-1",
        ledgerId: "ledger-1",
        tiles: [{ data: Buffer.from("a"), mediaType: "image/jpeg" }],
      }),
    ).rejects.toMatchObject({ status: 502 });
  });
});

function tileFile(bytes: number[], name: string, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("collectRecognitionTiles", () => {
  it("collects ordered tiles and tolerates field gaps", async () => {
    const tiles = await collectRecognitionTiles({
      file0: tileFile([1], "a.jpg", "image/jpeg"),
      file2: tileFile([2, 3], "c.png", "image/png"),
    });
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toEqual({
      data: Buffer.from([1]),
      mediaType: "image/jpeg",
    });
    expect(tiles[1]).toEqual({
      data: Buffer.from([2, 3]),
      mediaType: "image/png",
    });
  });

  it("rejects a form with no tiles", async () => {
    await expect(collectRecognitionTiles({})).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects non-File values, oversized files, and foreign types", async () => {
    await expect(
      collectRecognitionTiles({ file0: "not-a-file" }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      collectRecognitionTiles({
        file0: tileFile(
          new Array(6 * 1024 * 1024).fill(0),
          "big.jpg",
          "image/jpeg",
        ),
      }),
    ).rejects.toMatchObject({ status: 413 });

    await expect(
      collectRecognitionTiles({
        file0: tileFile([1], "a.gif", "image/gif"),
      }),
    ).rejects.toMatchObject({ status: 415 });

    await expect(
      collectRecognitionTiles({
        file0: tileFile([1], "a.jpg", ""),
      }),
    ).rejects.toMatchObject({ status: 415 });
  });
});
