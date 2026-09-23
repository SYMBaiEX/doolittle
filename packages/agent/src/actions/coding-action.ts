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
      "Plan and execute a coding task end to end. For requests to create, edit, fix, or build code, delegate the complete implementation once to TASKS_SPAWN_AGENT in the exact requested workspace. Never repeat a same-workspace delegation during one turn, whether the first worker completed or failed. If the worker exits unsuccessfully without the parent turn being cancelled, inspect its recorded activity and current files, then recover with native workspace and shell actions in the exact workspace; the worker's failure is not completion evidence. Surface authentication, model compatibility, explicit approval, security, path, or permission blockers without changing credentials, provider, target, or policy. If the delegate reports zero changed files, inspect the existing workspace and verify the full request; report a no-op only when every requirement is already satisfied, otherwise fix the concrete gap with native tools. Afterward use native workspace, file, and shell tools for remaining verification. The delegated agent must not run a production build or start the app; the parent runs any required Bun install and production build through Doolittle's shell tools after delegation completes. Run production builds before starting a managed dev server; never run a build that rewrites framework output (such as Next.js .next) while that server is running. After the final build, start or check the managed app and require its ready state; ready means its own HTTP GET probe succeeded. If a no-op is otherwise verified, do not repeat delegation or add a redundant curl after that readiness probe. Finish as soon as the completion contract is met, then give the user the verified URL and stop instructions. Do not stop after preliminary reads or present raw tool output as the final answer.",
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
        "Execute the user's full coding request end to end. Inspect only the specified path, create or edit the requested files, install dependencies as needed, run focused tests, fix recoverable errors, and verify outcomes. Delegate the same workspace once for implementation; a successful receipt is evidence to verify, not a reason to launch another implementation agent. If the worker fails without parent-turn cancellation, inspect its activity and current workspace changes, then continue through native Doolittle tools in the exact workspace. Do not retry delegation during the same turn. Surface authentication, model compatibility, explicit approval, security, path, or permission blockers without changing credentials, provider, target, or policy. The delegated coding agent must not run a production build or start the dev server. After delegation finishes or fails recoverably, the parent must run any required Bun install and production build through Doolittle's shell tools in the exact workspace, wait for exit code 0, then start or check the managed application as the final operational step. Stop or refuse the build if a managed dev server is already running in that workspace; never let Next.js build and dev write to the same .next directory concurrently. A DOOLITTLE_APP_SERVER status of ready includes a successful HTTP GET probe; after the final build, use that fresh ready receipt as the required URL check and do not redundantly curl before/after it for a no-op completion. When a completed delegate explicitly reports that the existing app already meets the request, do not delegate again; use native tools only for missing install/build/server verification, then finish as soon as the no-op completion contract is met. Do not stop after inspection or a partial edit, do not present raw tool output as a final answer, and report only verified completion or a concrete blocker.",
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
