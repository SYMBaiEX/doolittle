import type { Action, ActionResult } from "@elizaos/core";

export const DOOLITTLE_CODING_ACTION = "DOOLITTLE_CODING";

export const DOOLITTLE_CODING_SUBACTIONS = [
  "DOOLITTLE_WORKSPACE",
  "READ_FILE",
  "SEARCH_FILES",
  "WRITE_FILE",
  "CREATE_DIRECTORY",
  "PATCH_FILE",
  "DOOLITTLE_REPOSITORY",
  "SHELL",
] as const;

/**
 * Gives Eliza's native planner one coherent coding capability boundary.
 *
 * The SDK intercepts a selected parent with sub-actions and runs its native
 * sub-planner over the declared children. The handler remains a defensive
 * fallback for direct/legacy invocation paths; coding work still executes only
 * through the existing receipt-producing child actions.
 */
export function createCodingAction(): Action {
  return {
    name: DOOLITTLE_CODING_ACTION,
    similes: ["CODE_PROJECT", "EDIT_CODEBASE", "IMPLEMENT_CHANGE"],
    description:
      "Plan and execute a coding task using the selected workspace, file operations, repository inspection, and terminal verification. Use this parent for multi-step implementation or debugging work; its Eliza sub-planner selects the concrete child tools.",
    descriptionCompressed:
      "Plan multi-step coding work across files, repositories, and verification commands.",
    routingHint:
      "multi-step implementation, debugging, refactoring, or code verification -> DOOLITTLE_CODING",
    contexts: ["code", "files"],
    cacheStable: true,
    subPlanner: {
      name: "Doolittle coding planner",
      description:
        "Inspect before editing, make scoped changes, and verify the result with repository or shell tools.",
    },
    subActions: [...DOOLITTLE_CODING_SUBACTIONS],
    validate: async () => true,
    handler: async (): Promise<ActionResult> => ({
      success: false,
      text: "Coding requires the Eliza sub-planner and its registered child actions.",
      error: "CODING_SUBPLANNER_REQUIRED",
      data: { actionName: DOOLITTLE_CODING_ACTION },
    }),
    examples: [
      [
        {
          name: "{{userName}}",
          content: {
            text: "Refactor the provider adapter and run its tests.",
          },
        },
        {
          name: "{{agentName}}",
          content: {
            text: "I’ll inspect the implementation, make the scoped change, and verify it.",
            actions: [DOOLITTLE_CODING_ACTION],
          },
        },
      ],
    ],
  };
}
