import type { ClientResponse } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";
import { type WithFeedbackConfig, withFeedback } from "@/utils/with-feedback";

type ExtractSuccessResponse<T> = T extends ClientResponse<
  infer R,
  infer S,
  infer F
>
  ? S extends SuccessStatusCode
  ? ClientResponse<R, S, F>
  : never
  : never;

export function withFeedbackApi<
  // biome-ignore lint/suspicious/noExplicitAny: Hono client has overloaded signatures, need permissive constraint
  T extends (...args: any[]) => Promise<ClientResponse<any, any, any>>,
>(fn: T, config?: WithFeedbackConfig) {
  return async (
    ...args: Parameters<T>
  ): Promise<ExtractSuccessResponse<Awaited<ReturnType<T>>>> => {
    const res = await withFeedback(fn, config)(...args);
    if (res.ok) {
      return res as ExtractSuccessResponse<Awaited<ReturnType<T>>>;
    } else {
      const contentType = res.headers.get("Content-Type");
      switch (contentType) {
        case "application/json": {
          const json = await res.json();
          throw new Error(json.message);
        }
        default: {
          throw new Error(res.statusText);
        }
      }
    }
  };
}
