import type { CommandResult } from "@elizaos/autonomous/services/coding-agent-context";
import type { ActionResult } from "@elizaos/core";
import { summarizeActionResults } from "@/runtime/action-result-metadata";
import { classifyTurnMessage } from "@/runtime/turn-classification/message";
import type { LocalMutationInput } from "@/services/run-controller-service";

const FILE_MUTATION_REQUEST_PATTERN =
  /\b(?:create|make|write|add|edit|update|change|modify|patch|delete|remove|scaffold|build|generate|save|mkdir|touch)\b[\s\S]*\b(?:file|files|folder|directory|html|css|js|javascript|typescript|json|md|markdown|website|site|project|app|application)\b|\b(?:file|files|folder|directory|html|css|js|javascript|typescript|json|md|markdown|website|site|project|app|application)\b[\s\S]*\b(?:create|make|write|add|edit|update|change|modify|patch|delete|remove|scaffold|build|generate|save|mkdir|touch)\b/iu;
const FILE_WRITE_REQUEST_PATTERN =
  /\b(?:create|make|write|add|edit|update|change|modify|patch|scaffold|build|generate|save|touch)\b[\s\S]*\b(?:file|files|html|css|js|javascript|typescript|json|md|markdown|website|site|page)\b|\b(?:file|files|html|css|js|javascript|typescript|json|md|markdown|website|site|page)\b[\s\S]*\b(?:create|make|write|add|edit|update|change|modify|patch|scaffold|build|generate|save|touch)\b/iu;
const SHELL_SCAFFOLD_REQUEST_PATTERN =
  /\b(?:bunx|npx|pnpm\s+(?:dlx|create)|yarn\s+(?:create|dlx)|npm\s+(?:init|create|exec)|create-(?:react-app|next-app|vite|tauri-app|t3-app|expo-app|nuxt-app|svelte-app|astro)|cargo\s+(?:new|init)|git\s+clone|anchor\s+init|vite|next|nuxt|astro|expo|sveltekit|hardhat|forge|spl-token|metaplex)\b/iu;
const SHELL_SCAFFOLD_COMMAND_PATTERN =
  /\b(?:bunx|npx|pnpm|yarn|npm|create-(?:react-app|next-app|vite|tauri-app|t3-app|expo-app|nuxt-app|svelte-app|astro)|cargo\s+(?:new|init|build|test|run)|git\s+clone|anchor|forge|hardhat|vite|next|expo|sveltekit|spl-token|metaplex|mkdir|cp|mv|rsync)\b/iu;

const EMPTY_PROVIDER_EXECUTION_PATTERN = /^🔎\s*Provider executed:\s*\[\]\s*$/u;

export interface TurnExecutionContract {
  requiresLocalExecution: boolean;
  requiresMutationProof: boolean;
  requiredMutationActions: string[];
  reason?: string;
}

export interface TurnExecutionAssessment {
  ok: boolean;
  failureMessage?: string;
}

function summarizeFailedMutation(
  localMutations: LocalMutationInput[],
): string | undefined {
  const failed = localMutations.find((mutation) => !mutation.success);
  if (!failed) {
    return undefined;
  }
  const path = failed.resolvedPath ?? failed.requestedPath;
  return [failed.action, path, failed.message].filter(Boolean).join(" · ");
}

export function looksLikeEmptyProviderExecution(response: string): boolean {
  return EMPTY_PROVIDER_EXECUTION_PATTERN.test(response.trim());
}

export function buildTurnExecutionContract(input: {
  message: string;
  localInteractive: boolean;
}): TurnExecutionContract {
  if (!input.localInteractive) {
    return {
      requiresLocalExecution: false,
      requiresMutationProof: false,
      requiredMutationActions: [],
    };
  }

  const classification = classifyTurnMessage(input.message);
  const requiresLocalExecution =
    classification.actionOriented &&
    (classification.likelyLocalTask || classification.shouldUseMultiStep);
  const requiresMutationProof =
    requiresLocalExecution && FILE_MUTATION_REQUEST_PATTERN.test(input.message);
  const shellScaffoldRequested = SHELL_SCAFFOLD_REQUEST_PATTERN.test(
    input.message,
  );

  const requiredMutationActions: string[] = [];
  if (requiresMutationProof) {
    if (FILE_WRITE_REQUEST_PATTERN.test(input.message)) {
      requiredMutationActions.push("WRITE_FILE", "PATCH_FILE");
    }
    if (shellScaffoldRequested) {
      requiredMutationActions.push("RUN_IN_TERMINAL");
    }
  }

  return {
    requiresLocalExecution,
    requiresMutationProof,
    requiredMutationActions,
    reason: requiresMutationProof
      ? "local file mutation requested"
      : requiresLocalExecution
        ? "local execution requested"
        : undefined,
  };
}

function commandResultLooksLikeMutation(result: CommandResult): boolean {
  if (!result.success || result.exitCode !== 0) {
    return false;
  }
  return SHELL_SCAFFOLD_COMMAND_PATTERN.test(result.command);
}

export function assessTurnExecutionContract(input: {
  contract: TurnExecutionContract;
  response: string;
  observedActionCount: number;
  actionResults?: ActionResult[];
  localMutations?: LocalMutationInput[];
  commandResults?: CommandResult[];
  runFailureMessage?: string;
}): TurnExecutionAssessment {
  if (!input.contract.requiresLocalExecution || input.runFailureMessage) {
    return { ok: true };
  }

  const actionResultSummary = summarizeActionResults(input.actionResults);
  const observedActionCount = Math.max(
    input.observedActionCount,
    actionResultSummary.observedActionCount,
  );
  const localMutations = [
    ...actionResultSummary.localMutations,
    ...(input.localMutations ?? []),
  ];
  const commandResults = [
    ...actionResultSummary.commandResults,
    ...(input.commandResults ?? []),
  ];
  const scaffoldingCommands = commandResults.filter(
    commandResultLooksLikeMutation,
  );

  if (
    observedActionCount === 0 &&
    looksLikeEmptyProviderExecution(input.response)
  ) {
    return {
      ok: false,
      failureMessage:
        "Native planning failed: the provider returned no executable actions for a local execution request.",
    };
  }

  if (input.contract.requiresMutationProof && observedActionCount === 0) {
    return {
      ok: false,
      failureMessage:
        "Native planning failed: the turn required local file changes, but no local actions executed.",
    };
  }

  if (input.contract.requiresMutationProof) {
    const successfulMutation = localMutations.some(
      (mutation) => mutation.success,
    );
    const successfulScaffoldCommand = scaffoldingCommands.length > 0;
    if (!successfulMutation && !successfulScaffoldCommand) {
      const failedMutation = summarizeFailedMutation(localMutations);
      return {
        ok: false,
        failureMessage: failedMutation
          ? `Native execution failed: the requested file change did not land (${failedMutation}).`
          : "Native execution failed: the requested file change did not produce an SDK action-result mutation receipt.",
      };
    }

    if (input.contract.requiredMutationActions.length > 0) {
      const required = input.contract.requiredMutationActions;
      const hasRequiredMutation = localMutations.some(
        (mutation) => mutation.success && required.includes(mutation.action),
      );
      const hasRequiredCommand =
        required.includes("RUN_IN_TERMINAL") && successfulScaffoldCommand;
      if (!hasRequiredMutation && !hasRequiredCommand) {
        return {
          ok: false,
          failureMessage: `Native execution failed: the requested file write did not land. Expected one of ${required.join(", ")}.`,
        };
      }
    }
  }

  return { ok: true };
}
