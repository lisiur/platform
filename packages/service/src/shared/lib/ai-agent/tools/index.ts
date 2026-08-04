import type { ToolSet } from "ai";
import {
  type CallApiContext,
  type ForwardedHeaders,
  makeCallApiTool,
} from "./call-api";
import { makeChooseOptionTool } from "./choose-option";
import { makeGetApiSchemaTool } from "./get-api-schema";
import { makeReadFileTool } from "./read-file";
import { makeRenderFormTool } from "./render-form";

export type { CallApiContext, ForwardedHeaders };

export function buildInteractionTools(): ToolSet {
  return {
    choose_option: makeChooseOptionTool(),
    render_form: makeRenderFormTool(),
  };
}

export function buildTools(ctx: CallApiContext): ToolSet {
  return {
    get_api_schema: makeGetApiSchemaTool(ctx),
    call_api: makeCallApiTool(ctx),
    read_file: makeReadFileTool(ctx),
  };
}
