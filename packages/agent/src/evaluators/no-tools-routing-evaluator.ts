import type { ResponseHandlerEvaluator } from "@elizaos/core";
import { hasExplicitNoToolsIntent } from "@/runtime/no-tools-intent";
import { messageText } from "@/utils/eliza-compat";

/** Apply the user's explicit tool ban to this message's SDK route only. */
export const noToolsRoutingEvaluator: ResponseHandlerEvaluator = {
  name: "doolittle.no_tools_routing",
  description:
    "Keeps explicit tool-free requests on the SDK direct-reply path.",
  priority: 50,
  shouldRun: ({ message }) => hasExplicitNoToolsIntent(messageText(message)),
  evaluate: () => ({
    requiresTool: false,
    setContexts: ["simple"],
    clearCandidateActions: true,
    clearParentActionHints: true,
    // Preserve the Stage-1 answer; the simple route never enters the planner.
    debug: ["explicit tool ban requires a direct reply without agent actions"],
  }),
};
