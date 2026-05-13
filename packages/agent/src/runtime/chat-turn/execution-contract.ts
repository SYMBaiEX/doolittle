import { classifyTurnMessage } from "@/runtime/turn-classification/message";

const FILE_MUTATION_REQUEST_PATTERN =
  /\b(?:create|make|write|add|edit|update|change|modify|patch|delete|remove|scaffold|build|generate|save|mkdir|touch)\b[\s\S]*\b(?:file|files|folder|directory|html|css|js|javascript|typescript|json|md|markdown|website|site|project)\b|\b(?:file|files|folder|directory|html|css|js|javascript|typescript|json|md|markdown|website|site|project)\b[\s\S]*\b(?:create|make|write|add|edit|update|change|modify|patch|delete|remove|scaffold|build|generate|save|mkdir|touch)\b/iu;

const EMPTY_PROVIDER_EXECUTION_PATTERN = /^🔎\s*Provider executed:\s*\[\]\s*$/u;

export interface TurnExecutionContract {
  requiresLocalExecution: boolean;
  requiresMutationProof: boolean;
  reason?: string;
}

export interface TurnExecutionAssessment {
  ok: boolean;
  failureMessage?: string;
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

  return { ok: true };
}
