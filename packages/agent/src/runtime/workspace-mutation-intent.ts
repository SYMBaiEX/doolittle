const INFORMATIONAL_PREFIX =
  /^(?:can you (?:explain|show me how)|could you (?:explain|show me how)|explain\b|how (?:can|do|should|would)\b|how to\b|show me how\b|tell me how\b|what (?:could|should|would)\b)/iu;

const MUTATION_VERB =
  /\b(?:add|added|adding|build|built|building|create|created|creating|delete|deleted|deleting|edit|edited|editing|fix|fixed|fixing|generate|generated|generating|implement|implemented|implementing|make|made|making|modify|modified|modifying|move|moved|moving|patch|patched|patching|refactor|refactored|refactoring|remove|removed|removing|rename|renamed|renaming|repair|repaired|repairing|rewrite|rewrote|rewritten|rewriting|scaffold|scaffolded|scaffolding|update|updated|updating|write|wrote|written|writing)\b/iu;

const WORKSPACE_ARTIFACT =
  /(?:\b(?:adapter|app|application|class|code|codebase|component|config(?:uration)?|directory|docs?|documentation|file|folder|function|module|page|project|readme(?:\.md)?|repo(?:sitory)?|route|script|service|source|stylesheet|tests?|workspace)\b|(?:^|[\s'"`(])(?:\.\.?\/)?(?:[\w@.-]+\/)+[\w@.-]+|\b[\w-]+\.(?:c|cc|cpp|css|go|h|hpp|html|java|js|json|jsx|md|mjs|php|py|rb|rs|sh|sql|swift|toml|ts|tsx|vue|xml|ya?ml)\b)/iu;

const CONTINUATION_REQUEST =
  /^(?:continue|finish(?: it| this)?|keep going|pick (?:it|this) back up|resume|try again)[\s.!?]*$/iu;

const UNFINISHED_MUTATION_MARKER =
  /(?:REQUESTED_LOCAL_MUTATION|stopped before completing the requested workspace change|don't yet have evidence that the changes|do not yet have evidence that the changes)/iu;

interface MutationIntentMessage {
  role?: string;
  text?: string;
}

/**
 * Conservative deterministic gate for requests that explicitly require a
 * local workspace mutation. It deliberately excludes advice and hypothetical
 * wording so ordinary code questions remain direct chat turns.
 */
export function hasExplicitWorkspaceMutationIntent(message: string): boolean {
  const normalized = message.trim();
  if (!normalized || INFORMATIONAL_PREFIX.test(normalized)) return false;
  return MUTATION_VERB.test(normalized) && WORKSPACE_ARTIFACT.test(normalized);
}

export function continuesWorkspaceMutationIntent(
  message: string,
  recentMessages: readonly MutationIntentMessage[],
): boolean {
  if (!CONTINUATION_REQUEST.test(message.trim())) return false;
  return recentMessages.some(
    (entry) =>
      entry.role === "assistant" &&
      UNFINISHED_MUTATION_MARKER.test(entry.text ?? ""),
  );
}

export function hasWorkspaceMutationObligation(
  message: string,
  recentMessages: readonly MutationIntentMessage[] = [],
): boolean {
  return (
    hasExplicitWorkspaceMutationIntent(message) ||
    continuesWorkspaceMutationIntent(message, recentMessages)
  );
}

export function renderWorkspaceMutationExecutionContract(
  message: string,
  recentMessages: readonly MutationIntentMessage[] = [],
): string[] {
  if (!hasWorkspaceMutationObligation(message, recentMessages)) return [];
  return [
    "TURN EXECUTION CONTRACT",
    "The current request explicitly requires a local workspace mutation.",
    "Reading, searching, inspecting, or describing a planned change is not completion.",
    "Continue until WRITE_FILE, PATCH_FILE, CREATE_DIRECTORY, or another receipt-producing local mutation succeeds.",
    "If the change cannot be made, stop with the concrete blocker; never end on a progress-only promise.",
  ];
}
