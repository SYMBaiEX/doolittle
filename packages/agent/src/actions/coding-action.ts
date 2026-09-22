import type { Action, ActionResult } from "@elizaos/core";

export const DOOLITTLE_CODING_ACTION = "DOOLITTLE_CODING";

export const DOOLITTLE_CODING_SUBACTIONS = [
  // Prefer the managed ACP implementation path for real coding work. It uses
  // the selected provider, waits for the child to finish, and returns a
  // receipt-backed result; the remaining native tools support scope and
  // post-delegation verification.
  "TASKS_SPAWN_AGENT",
  "DOOLITTLE_WORKSPACE",
  "READ_FILE",
  "SEARCH_FILES",
  "WRITE_FILE",
  "CREATE_DIRECTORY",
  "PATCH_FILE",
  "DOOLITTLE_REPOSITORY",
  "SHELL",
  "DOOLITTLE_APP_SERVER",
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
      "Plan and execute a coding task end to end. For any request that asks to create, edit, fix, or build code, start with TASKS_SPAWN_AGENT so the configured coding adapter implements the change in the exact requested workspace. Do not spend the turn repeating workspace inspection or stop after preliminary reads. After the coding agent returns, use the available workspace, file, shell, and app-server tools only for requested verification or application handoff. Use this parent for multi-step implementation or debugging work.",
    descriptionCompressed:
      "Implement code requests through TASKS_SPAWN_AGENT, then verify with workspace and app tools.",
    routingHint:
      "multi-step implementation, debugging, refactoring, or code verification -> DOOLITTLE_CODING",
    contexts: ["code", "files"],
    cacheStable: true,
    subPlanner: {
      name: "Doolittle coding planner",
      // Keep an equivalent directive in the parent and child tool descriptions:
      // the installed Eliza beta does not currently inject this field into the
      // child planner's tool context.
      description:
        "Execute the user's full coding request end to end. Inspect only the specified path, create or edit the requested files, install dependencies and run requested checks or application startup, fix recoverable errors, and verify outcomes. Do not stop after inspection or a partial edit, do not present tool output as a final answer, and report only verified completion or a concrete blocker.",
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
