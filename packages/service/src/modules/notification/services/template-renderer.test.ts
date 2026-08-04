import { describe, expect, it } from "vitest";
import { renderTemplate, validateTemplateVariables } from "./template-renderer";

describe("notification template rendering", () => {
  it("renders variables into templates", () => {
    expect(
      renderTemplate("Hello {{ user.name }}, visit {{dashboardUrl}}", {
        user: { name: "Alice" },
        dashboardUrl: "https://example.com",
      }),
    ).toBe("Hello Alice, visit https://example.com");
  });

  it("fails when a rendered variable is missing", () => {
    expect(() => renderTemplate("Hello {{name}}", {})).toThrow(
      'Missing notification variable "name"',
    );
  });

  it("validates required variables and simple property types", () => {
    expect(() =>
      validateTemplateVariables(
        {
          required: ["name"],
          properties: { name: { type: "string" }, count: { type: "number" } },
        },
        { name: "Alice", count: 2 },
      ),
    ).not.toThrow();
  });

  it("rejects variables with the wrong type", () => {
    expect(() =>
      validateTemplateVariables(
        { properties: { count: { type: "number" } } },
        { count: "2" },
      ),
    ).toThrow('Notification variable "count" must be number');
  });
});
