"use client";

import {
  AgentLauncher,
  type AgentSessionsApi,
  withApiFeedback,
} from "@repo/frontend";
import { API_ORIGIN, APP_CODE, appClient } from "@/lib/api";

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
  return (
    <AgentLauncher
      apiOrigin={API_ORIGIN}
      appCode={APP_CODE}
      sessionsApi={sessionsApi}
    />
  );
}
