import type { HandlerOptions, Memory } from "@elizaos/core";
import { resolveWorkspaceIntentFromParams } from "../workspace-action-intents/parsing/params";
import { resolveWorkspaceIntentFromText } from "../workspace-action-intents/parsing/text";
import {
  extractExplicitProjectPath,
  extractNamedLocalCodebase,
} from "../workspace-action-intents/path-extraction";
import { resolveLocalProjectPath } from "../workspace-action-intents/project-resolution";
import { sanitizeFindQuery } from "../workspace-action-intents/shared/string-helpers";
import type { WorkspaceIntent } from "../workspace-action-intents/types";

export {
  extractExplicitProjectPath,
  extractNamedLocalCodebase,
  resolveLocalProjectPath,
  resolveWorkspaceIntentFromParams,
  resolveWorkspaceIntentFromText,
  sanitizeFindQuery,
  type WorkspaceIntent,
};

export function readWorkspaceActionText(message: Memory): string | undefined {
  return typeof message.content === "string"
    ? message.content
    : message.content?.text;
}

export function resolveWorkspaceActionIntent(
  options: HandlerOptions | undefined,
  text: string | undefined,
): WorkspaceIntent | undefined {
  return (
    resolveWorkspaceIntentFromParams(options?.parameters) ??
    (text ? resolveWorkspaceIntentFromText(text) : undefined)
  );
}
