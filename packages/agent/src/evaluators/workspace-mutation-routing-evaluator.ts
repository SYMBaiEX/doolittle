import type { ResponseHandlerEvaluator } from "@elizaos/core";
import { DOOLITTLE_CODING_ACTION } from "@/actions/coding-action";
import { hasExplicitWorkspaceMutationIntent } from "@/runtime/workspace-mutation-intent";
import { messageText } from "@/utils/eliza-compat";

/**
 * Eliza-native Stage-1 routing patch for explicit workspace mutations.
 *
 * The published beta predates Eliza's required native `eliza_turn_scope`
 * declaration. Routing the whole request through the existing coding parent
 * gives the SDK one cohesive sub-planner surface, while the post-provider
 * receipt contract remains the final fail-closed boundary.
 */
export const workspaceMutationRoutingEvaluator: ResponseHandlerEvaluator = {
  name: "doolittle.workspace_mutation_routing",
  description:
    "Routes explicit local file and code mutations through Doolittle's Eliza-native coding sub-planner.",
  priority: 25,
  shouldRun: ({ message }) =>
    hasExplicitWorkspaceMutationIntent(messageText(message)),
  evaluate: () => ({
    requiresTool: true,
    addContexts: ["code", "files"],
    // Replace the broad top-level action surface instead of merely appending
    // another candidate. Otherwise the beta planner can select READ_FILE as a
    // standalone tool and let its evaluator finish before the requested write.
    // The coding parent exposes those same read/search/write children through
    // Eliza's native sub-planner, keeping inspect -> mutate -> verify together.
    clearCandidateActions: true,
    addCandidateActions: [DOOLITTLE_CODING_ACTION],
    clearParentActionHints: true,
    addParentActionHints: [DOOLITTLE_CODING_ACTION],
    clearReply: true,
    debug: ["explicit workspace mutation requires receipt-backed completion"],
  }),
};
