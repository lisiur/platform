import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/db", () => ({
  prisma: {
    aiAgent: { findUnique: vi.fn() },
    aiModel: { findMany: vi.fn() },
    aiModelPricing: { findMany: vi.fn() },
  },
}));

vi.mock("#modules/pricing/public", () => ({
  hasActiveFeatureForUser: vi.fn(async () => true),
}));

vi.mock("#lib/crypto", () => ({
  decryptSecret: vi.fn(() => "plain-key"),
}));

vi.mock("../account-concurrency", () => ({
  accountConcurrencyTracker: { utilization: vi.fn(() => 0) },
}));

import { prisma } from "#lib/db";
import { resolveAgentModel } from "../agent-resolution.service";

const agentFindUnique = vi.mocked(prisma.aiAgent.findUnique);
const modelFindMany = vi.mocked(prisma.aiModel.findMany);
const pricingFindMany = vi.mocked(prisma.aiModelPricing.findMany);

function agentRow() {
  return {
    id: "agent-1",
    code: "qianlai_receipt",
    status: "active",
    allowedApis: null,
    // Prisma Json column — an object, not a string.
    subAgents: {
      default: { label: "Receipt Recognition", modelId: "deepseek-v4-flash" },
    },
  };
}

function modelRow(budget: {
  maxImageEdge: number | null;
  maxPixelsPerImage: number | null;
  maxImagesPerRequest: number | null;
  imageMediaTypes: string[];
}) {
  return {
    id: "m1",
    modelId: "deepseek-v4-flash",
    capabilities: ["vision"],
    enabled: true,
    ...budget,
    provider: {
      aiAdapter: "openai_compatible",
      baseUrl: "https://api.deepseek.com",
      enabled: true,
      accounts: [
        {
          account: {
            id: "a1",
            status: "active",
            concurrencyLimit: 4,
            currency: "CNY",
            keys: [{ encryptedSecret: "enc", status: "active" }],
          },
        },
      ],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  agentFindUnique.mockResolvedValue(agentRow() as never);
  pricingFindMany.mockResolvedValue([]);
});

describe("resolveAgentModel imageInput", () => {
  it("carries the chosen model row's vision budget", async () => {
    modelFindMany.mockResolvedValue([
      modelRow({
        maxImageEdge: 1300,
        maxPixelsPerImage: null,
        maxImagesPerRequest: 6,
        imageMediaTypes: ["image/jpeg", "image/png"],
      }),
    ] as never);

    const resolved = await resolveAgentModel({
      agentCode: "qianlai_receipt",
      subAgent: "default",
      principal: { type: "user", id: "user-1" },
    });

    expect(resolved.imageInput).toEqual({
      maxImageEdge: 1300,
      maxPixelsPerImage: null,
      maxImagesPerRequest: 6,
      mediaTypes: ["image/jpeg", "image/png"],
    });
  });

  it("returns null when the model row carries no budget at all", async () => {
    modelFindMany.mockResolvedValue([
      modelRow({
        maxImageEdge: null,
        maxPixelsPerImage: null,
        maxImagesPerRequest: null,
        imageMediaTypes: [],
      }),
    ] as never);

    const resolved = await resolveAgentModel({
      agentCode: "qianlai_receipt",
      subAgent: "default",
      principal: { type: "user", id: "user-1" },
    });

    expect(resolved.imageInput).toBeNull();
  });

  it("carries a partial budget — null fields survive as null", async () => {
    modelFindMany.mockResolvedValue([
      modelRow({
        maxImageEdge: null,
        maxPixelsPerImage: 2_621_440,
        maxImagesPerRequest: null,
        imageMediaTypes: [],
      }),
    ] as never);

    const resolved = await resolveAgentModel({
      agentCode: "qianlai_receipt",
      subAgent: "default",
      principal: { type: "user", id: "user-1" },
    });

    expect(resolved.imageInput).toEqual({
      maxImageEdge: null,
      maxPixelsPerImage: 2_621_440,
      maxImagesPerRequest: null,
      mediaTypes: [],
    });
  });
});
