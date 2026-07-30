import type { ToolSet } from "ai";
import {
  type CallApiContext,
  type ForwardedHeaders,
  makeCallApiTool,
} from "./call-api";
import { makeGetApiSchemaTool } from "./get-api-schema";
import { makeReadFileTool } from "./read-file";

export type { CallApiContext, ForwardedHeaders };

export function buildTools(ctx: CallApiContext): ToolSet {
  return {
    get_api_schema: makeGetApiSchemaTool(ctx),
    call_api: makeCallApiTool(ctx),
    read_file: makeReadFileTool(ctx),
  };
}
