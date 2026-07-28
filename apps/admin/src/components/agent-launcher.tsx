"use client";

import {
  AgentLauncher,
  type AgentSessionsApi,
  withApiFeedback,
} from "@repo/frontend";
import { API_ORIGIN, APP_CODE, appClient } from "@/lib/api";
import { useHasPermission } from "@/lib/api/use-has-permission";

const sessionsApi: AgentSessionsApi = {
  list: async (query) => {
    const res = await withApiFeedback(appClient.api.agent.sessions.$get)({
      query,
    });
    return res.json();
  },
  create: async () => {
    const res = await withApiFeedback(appClient.api.agent.sessions.$post)({});
    return res.json();
  },
  delete: async (id) => {
    await withApiFeedback(appClient.api.agent.sessions[":id"].$delete)({
      param: { id },
    });
  },
};

export function AgentLauncherConnected() {
  const canChat = useHasPermission("system/agent:chat");
  if (!canChat) return null;

  return (
    <AgentLauncher
      apiOrigin={API_ORIGIN}
      appCode={APP_CODE}
      sessionsApi={sessionsApi}
    />
  );
}
