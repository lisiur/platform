import { type ToolSet, tool } from "ai";
import { z } from "zod";

export const CHOOSE_OPTION_TOOL_NAME = "choose_option";

export function makeChooseOptionTool(): ToolSet[string] {
  return tool({
    description:
      "Ask the user to choose one or more options before continuing. Use this when user input is required to disambiguate the next step.",
    inputSchema: z.object({
      prompt: z.string().describe("The question to show to the user."),
      options: z
        .array(
          z.object({
            id: z
              .string()
              .describe("Stable option id returned when the user selects it."),
            label: z.string().describe("Short label displayed for the option."),
            description: z
              .string()
              .optional()
              .describe("Optional extra context for the option."),
          }),
        )
        .min(1)
        .describe("The available choices."),
      multiple: z
        .boolean()
        .optional()
        .describe("Whether the user may select more than one option."),
    }),
  }) satisfies ToolSet[string];
}
