import { getMergedAppConfigRows } from "#modules/application/public";

export interface AiAgentUiConfig {
  showReasoning: boolean;
  showToolCalls: boolean;
}

/**
 * Resolves the app's AI Agent *visual* config — which chat UI parts the user
 * sees. Independent from the functional reasoning level, which is resolved
 * server-side only. Both flags default to `false` (not shown): a panel is
 * shown only when its config value is explicitly `"true"`. Empty/unset values,
 * missing rows, and `"false"` all resolve to hidden.
 */
export async function loadAiAgentUiConfig(
  appId: string,
): Promise<AiAgentUiConfig> {
  const map = new Map(
    (await getMergedAppConfigRows(appId, "ai-agent-ui")).map((r) => [
      r.key,
      r.value,
    ]),
  );
  return {
    showReasoning: map.get("showReasoning") === "true",
    showToolCalls: map.get("showToolCalls") === "true",
  };
}
