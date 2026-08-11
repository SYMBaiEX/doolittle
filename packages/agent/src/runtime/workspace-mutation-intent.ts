const INFORMATIONAL_PREFIX =
  /^(?:can you (?:explain|show me how)|could you (?:explain|show me how)|explain\b|how (?:can|do|should|would)\b|how to\b|show me how\b|tell me how\b|what (?:could|should|would)\b)/iu;

const MUTATION_VERB =
  /\b(?:add|added|adding|create|created|creating|delete|deleted|deleting|edit|edited|editing|fix|fixed|fixing|generate|generated|generating|implement|implemented|implementing|modify|modified|modifying|move|moved|moving|patch|patched|patching|refactor|refactored|refactoring|remove|removed|removing|rename|renamed|renaming|repair|repaired|repairing|rewrite|rewrote|rewritten|rewriting|scaffold|scaffolded|scaffolding|update|updated|updating|write|wrote|written|writing)\b/iu;

const WORKSPACE_ARTIFACT =
  /(?:\b(?:adapter|class|code|codebase|component|config(?:uration)?|docs?|documentation|file|function|module|page|project|readme(?:\.md)?|repo(?:sitory)?|route|script|service|source|stylesheet|tests?|workspace)\b|(?:^|[\s'"`(])(?:\.\.?\/)?(?:[\w@.-]+\/)+[\w@.-]+|\b[\w-]+\.(?:c|cc|cpp|css|go|h|hpp|html|java|js|json|jsx|md|mjs|php|py|rb|rs|sh|sql|swift|toml|ts|tsx|vue|xml|ya?ml)\b)/iu;

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

export function renderWorkspaceMutationExecutionContract(
  message: string,
): string[] {
  if (!hasExplicitWorkspaceMutationIntent(message)) return [];
  return [
    "TURN EXECUTION CONTRACT",
    "The current request explicitly requires a local workspace mutation.",
    "Reading, searching, inspecting, or describing a planned change is not completion.",
    "Continue until WRITE_FILE, PATCH_FILE, CREATE_DIRECTORY, or another receipt-producing local mutation succeeds.",
    "If the change cannot be made, stop with the concrete blocker; never end on a progress-only promise.",
  ];
}
