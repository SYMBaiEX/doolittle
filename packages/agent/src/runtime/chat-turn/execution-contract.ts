import { classifyTurnMessage } from "@/runtime/turn-classification/message";
import type { LocalMutationRecord } from "@/services/run-controller-service";

const FILE_MUTATION_REQUEST_PATTERN =
  /\b(?:create|make|write|add|edit|update|change|modify|patch|delete|remove|scaffold|build|generate|save|mkdir|touch)\b[\s\S]*\b(?:file|files|folder|directory|html|css|js|javascript|typescript|json|md|markdown|website|site|project)\b|\b(?:file|files|folder|directory|html|css|js|javascript|typescript|json|md|markdown|website|site|project)\b[\s\S]*\b(?:create|make|write|add|edit|update|change|modify|patch|delete|remove|scaffold|build|generate|save|mkdir|touch)\b/iu;
const FILE_WRITE_REQUEST_PATTERN =
  /\b(?:create|make|write|add|edit|update|change|modify|patch|scaffold|build|generate|save|touch)\b[\s\S]*\b(?:file|files|html|css|js|javascript|typescript|json|md|markdown|website|site|page)\b|\b(?:file|files|html|css|js|javascript|typescript|json|md|markdown|website|site|page)\b[\s\S]*\b(?:create|make|write|add|edit|update|change|modify|patch|scaffold|build|generate|save|touch)\b/iu;

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
  localMutations: LocalMutationRecord[],
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

  return {
    requiresLocalExecution,
    requiresMutationProof,
    requiredMutationActions:
      requiresMutationProof && FILE_WRITE_REQUEST_PATTERN.test(input.message)
        ? ["WRITE_FILE", "PATCH_FILE"]
        : [],
    reason: requiresMutationProof
      ? "local file mutation requested"
      : requiresLocalExecution
        ? "local execution requested"
        : undefined,
  };
}

export function assessTurnExecutionContract(input: {
  contract: TurnExecutionContract;
  response: string;
  observedActionCount: number;
  localMutations?: LocalMutationRecord[];
  runFailureMessage?: string;
}): TurnExecutionAssessment {
  if (!input.contract.requiresLocalExecution || input.runFailureMessage) {
    return { ok: true };
  }

  if (
    input.observedActionCount === 0 &&
    looksLikeEmptyProviderExecution(input.response)
  ) {
    return {
      ok: false,
      failureMessage:
        "Native planning failed: the provider returned no executable actions for a local execution request.",
    };
  }

  if (input.contract.requiresMutationProof && input.observedActionCount === 0) {
    return {
      ok: false,
      failureMessage:
        "Native planning failed: the turn required local file changes, but no local actions executed.",
    };
  }

  if (input.contract.requiresMutationProof) {
    const localMutations = input.localMutations ?? [];
    const successfulMutation = localMutations.some(
      (mutation) => mutation.success,
    );
    if (!successfulMutation) {
      const failedMutation = summarizeFailedMutation(localMutations);
      return {
        ok: false,
        failureMessage: failedMutation
          ? `Native execution failed: the requested file change did not land (${failedMutation}).`
          : "Native execution failed: the requested file change did not produce a local mutation receipt.",
      };
    }

    if (input.contract.requiredMutationActions.length > 0) {
      const hasRequiredMutation = localMutations.some(
        (mutation) =>
          mutation.success &&
          input.contract.requiredMutationActions.includes(mutation.action),
      );
      if (!hasRequiredMutation) {
        return {
          ok: false,
          failureMessage: `Native execution failed: the requested file write did not land. Expected one of ${input.contract.requiredMutationActions.join(", ")}.`,
        };
      }
    }
  }

  return { ok: true };
}
