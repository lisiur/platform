import type { ClientResponse } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";
import { type WithFeedbackConfig, withFeedback } from "./with-feedback";

type ExtractSuccessResponse<T> =
  T extends ClientResponse<infer R, infer S, infer F>
    ? S extends SuccessStatusCode
      ? ClientResponse<R, S, F>
      : never
    : never;

function getContentType(res: Response) {
  return res.headers.get("Content-Type")?.split(";")[0];
}

function getErrorMessage(json: unknown) {
  if (typeof json === "object" && json !== null) {
    if ("message" in json && typeof json.message === "string") {
      return json.message;
    }
    if ("error" in json) {
      const { error } = json;
      if (typeof error === "string") return error;
      if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        return error.message;
      }
      return JSON.stringify(error);
    }
  }

  return JSON.stringify(json);
}

export function withApiFeedback<
  // biome-ignore lint/suspicious/noExplicitAny: Hono client has overloaded signatures, need permissive constraint
  T extends (...args: any[]) => Promise<ClientResponse<any, any, any>>,
>(fn: T, config?: WithFeedbackConfig) {
  return async (
    ...args: Parameters<T>
  ): Promise<ExtractSuccessResponse<Awaited<ReturnType<T>>>> => {
    return withFeedback(async (...args) => {
      const res = await fn(...args);
      if (res.ok) {
        return res as ExtractSuccessResponse<Awaited<ReturnType<T>>>;
      } else {
        switch (getContentType(res)) {
          case "application/json": {
            const json = await res.json();
            throw new Error(getErrorMessage(json));
          }
          default: {
            throw new Error(res.statusText);
          }
        }
      }
    }, config)(...args);
  };
}
