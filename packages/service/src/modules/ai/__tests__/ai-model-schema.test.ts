import { describe, expect, it } from "vitest";
import {
  aiModelSchema,
  createAiModelBodySchema,
  updateAiModelBodySchema,
} from "../routes/ai-model/schema";

describe("ai-model schemas vision budget fields", () => {
  it("round-trips the four budget columns through the response schema", () => {
    const parsed = aiModelSchema.parse({
      id: "m1",
      providerId: "p1",
      modelId: "deepseek-v4-flash",
      displayName: "deepseek-v4-flash",
      capabilities: ["vision"],
      contextWindow: null,
      maxImageEdge: 1300,
      maxPixelsPerImage: null,
      maxImagesPerRequest: 6,
      imageMediaTypes: ["image/jpeg", "image/png", "image/webp"],
      supportsReasoning: true,
      supportsCaching: true,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(parsed.maxImageEdge).toBe(1300);
    expect(parsed.maxPixelsPerImage).toBeNull();
    expect(parsed.maxImagesPerRequest).toBe(6);
    expect(parsed.imageMediaTypes).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("create accepts nulls (no model constraint) and omitted budget fields", () => {
    const explicit = createAiModelBodySchema.parse({
      providerId: "p1",
      modelId: "qwen3.7-plus",
      displayName: "qwen3.7-plus",
      maxImageEdge: null,
      maxPixelsPerImage: 2_621_440,
      maxImagesPerRequest: 250,
      imageMediaTypes: ["image/jpeg"],
    });
    expect(explicit.maxPixelsPerImage).toBe(2_621_440);
    expect(explicit.maxImageEdge).toBeNull();

    const bare = createAiModelBodySchema.parse({
      providerId: "p1",
      modelId: "m",
      displayName: "m",
    });
    expect(bare.maxImageEdge).toBeUndefined();
    expect(bare.imageMediaTypes).toBeUndefined();
  });

  it("update accepts partial budget fields", () => {
    const parsed = updateAiModelBodySchema.parse({
      maxPixelsPerImage: 16_777_216,
      imageMediaTypes: ["image/png"],
    });
    expect(parsed.maxPixelsPerImage).toBe(16_777_216);
    expect(parsed.imageMediaTypes).toEqual(["image/png"]);
    expect(parsed.maxImageEdge).toBeUndefined();
  });
});
