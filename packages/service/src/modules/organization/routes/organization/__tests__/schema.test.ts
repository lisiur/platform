import { describe, expect, it } from "vitest";
import {
  createOrganizationBodySchema,
  updateOrganizationBodySchema,
} from "../schema";

describe("organization logo schema", () => {
  it("accepts upload store logo URLs", () => {
    expect(
      createOrganizationBodySchema.safeParse({
        name: "Acme Corp",
        slug: "acme-corp",
        logo: "/api/upload/upload1",
      }).success,
    ).toBe(true);
  });

  it("rejects non-upload logo strings", () => {
    expect(
      createOrganizationBodySchema.safeParse({
        name: "Acme Corp",
        slug: "acme-corp",
        logo: "https://example.com/logo.png",
      }).success,
    ).toBe(false);
  });

  it("allows clearing organization logo with null", () => {
    expect(updateOrganizationBodySchema.safeParse({ logo: null }).success).toBe(
      true,
    );
  });
});
