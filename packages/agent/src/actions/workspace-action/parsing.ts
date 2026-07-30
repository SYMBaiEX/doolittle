import type { HandlerOptions } from "@elizaos/core";
import { resolveWorkspaceIntentFromParams } from "../workspace-action-intents/parsing/params";
import { sanitizeFindQuery } from "../workspace-action-intents/shared/string-helpers";
import type { WorkspaceIntent } from "../workspace-action-intents/types";

export {
  resolveWorkspaceIntentFromParams,
  sanitizeFindQuery,
  type WorkspaceIntent,
};

export function resolveWorkspaceActionIntent(
  options: HandlerOptions | undefined,
): WorkspaceIntent | undefined {
  return resolveWorkspaceIntentFromParams(options?.parameters);
}
