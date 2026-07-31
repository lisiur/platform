import { type ToolSet, tool } from "ai";
import { z } from "zod";

export const RENDER_FORM_TOOL_NAME = "render_form";

const formFieldTypeSchema = z.enum([
  "text",
  "email",
  "password",
  "number",
  "textarea",
  "select",
  "boolean",
  "date",
]);

const formOptionSchema = z.object({
  value: z
    .string()
    .describe("The value returned when this option is selected."),
  label: z.string().describe("The user-facing option label."),
});

export function makeRenderFormTool(): ToolSet[string] {
  return tool({
    description:
      "Render a frontend form and wait for the user to fill it in before continuing. " +
      "Use this after `get_api_schema` when an API call needs structured user input, " +
      "such as creating or updating a resource. Keep fields flat and use names that " +
      "you can map back to `call_api` pathParams, queryParams, or body fields.",
    inputSchema: z.object({
      operationId: z
        .string()
        .optional()
        .describe("The operationId this form will provide input for."),
      title: z.string().describe("Short form title shown to the user."),
      description: z
        .string()
        .optional()
        .describe("Optional instructions shown above the fields."),
      submitLabel: z
        .string()
        .optional()
        .describe("Optional submit button label. Defaults to Continue."),
      fields: z
        .array(
          z.object({
            name: z
              .string()
              .min(1)
              .describe("Stable field name returned with the submitted value."),
            label: z.string().describe("User-facing field label."),
            type: formFieldTypeSchema.describe(
              "The form control type to render.",
            ),
            required: z
              .boolean()
              .optional()
              .describe("Whether a non-empty value is required."),
            description: z
              .string()
              .optional()
              .describe("Optional helper text for this field."),
            placeholder: z
              .string()
              .optional()
              .describe("Optional placeholder for text-like controls."),
            options: z
              .array(formOptionSchema)
              .optional()
              .describe("Required for select fields; ignored for other types."),
            defaultValue: z
              .union([z.string(), z.number(), z.boolean()])
              .optional()
              .describe("Optional initial value."),
          }),
        )
        .min(1)
        .describe("The fields to ask the user for."),
    }),
  }) satisfies ToolSet[string];
}
