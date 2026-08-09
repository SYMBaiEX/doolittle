import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, normalize, sep } from "node:path";
import { resolveWorkspacePath } from "../workspace-service/path";

const MAX_BRANCH_LENGTH = 255;
export const MAX_WORKTREE_PATH_LENGTH = 4_096;
const MAX_MESSAGE_LENGTH = 10_000;
const MAX_REMOTE_URL_LENGTH = 4_096;
const MAX_PULL_REQUEST_TITLE_LENGTH = 256;
const MAX_PULL_REQUEST_BODY_LENGTH = 20_000;

export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

export function validateBranchName(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error("A branch name is required.");
  }
  if (
    value.length > MAX_BRANCH_LENGTH ||
    value.startsWith("-") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes("@{") ||
    value.endsWith(".") ||
    value.endsWith("/") ||
    /[\s~^:?*[\]]/u.test(value) ||
    value.split("/").some((segment) => !segment || segment.endsWith(".lock")) ||
    hasControlCharacters(value)
  ) {
    throw new Error("Branch name is not a valid Git branch.");
  }
  return value;
}

export function validateGitName(value: unknown, label: string): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error(`A ${label} is required.`);
  }
  if (
    value.length > MAX_BRANCH_LENGTH ||
    value.startsWith("-") ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value) ||
    value.includes("..") ||
    hasControlCharacters(value)
  ) {
    throw new Error(`${label} is not valid.`);
  }
  return value;
}

export function validateRef(value: unknown, label: string): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error(`A ${label} is required.`);
  }
  if (
    value.length > MAX_BRANCH_LENGTH ||
    value.startsWith("-") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes("@{") ||
    /[\s~^:?*[\]]/u.test(value) ||
    hasControlCharacters(value)
  ) {
    throw new Error(`${label} is not valid.`);
  }
  return value;
}

export function validateStashReference(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error("A stash reference is required.");
  }
  if (!/^stash@\{\d+\}$/u.test(value)) {
    throw new Error("Stash reference is not valid.");
  }
  return value;
}

export function validateRemoteUrl(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error("A remote URL is required.");
  }
  if (
    value.length > MAX_REMOTE_URL_LENGTH ||
    /\s/u.test(value) ||
    hasControlCharacters(value)
  ) {
    throw new Error("Remote URL is not valid.");
  }
  return value;
}

export function validateCommitMessage(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A commit message is required.");
  }
  if (value.length > MAX_MESSAGE_LENGTH || value.includes("\0")) {
    throw new Error(
      "Commit message is too long or contains invalid characters.",
    );
  }
  return value;
}

export function validatePullRequestTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A pull request title is required.");
  }
  if (
    value.length > MAX_PULL_REQUEST_TITLE_LENGTH ||
    value.includes("\0") ||
    hasControlCharacters(value.replaceAll("\n", ""))
  ) {
    throw new Error(
      "Pull request title is too long or contains invalid characters.",
    );
  }
  return value;
}

export function validatePullRequestBody(
  value: unknown,
  required = false,
): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || (required && !value.trim())) {
    throw new Error("A pull request review body is required.");
  }
  if (value.length > MAX_PULL_REQUEST_BODY_LENGTH || value.includes("\0")) {
    throw new Error(
      "Pull request body is too long or contains invalid characters.",
    );
  }
  return value;
}

export function validateReviewEvent(
  value: unknown,
): "approve" | "request-changes" | "comment" {
  if (
    value === "approve" ||
    value === "request-changes" ||
    value === "comment"
  ) {
    return value;
  }
  throw new Error("Pull request review event is not valid.");
}

export function validateMergeMethod(
  value: unknown,
): "merge" | "squash" | "rebase" {
  if (value === "merge" || value === "squash" || value === "rebase") {
    return value;
  }
  throw new Error("Pull request merge method is not valid.");
}

export function validateOptionalBoolean(
  value: unknown,
  label: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

export function validateWorktreePath(
  workspaceDir: string,
  value: unknown,
): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error("A workspace-relative worktree path is required.");
  }
  if (
    value.length > MAX_WORKTREE_PATH_LENGTH ||
    isAbsolute(value) ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes("\\") ||
    hasControlCharacters(value)
  ) {
    throw new Error("Worktree path must be a safe workspace-relative path.");
  }
  let decoded = value;
  try {
    for (let index = 0; index < 6; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    throw new Error("Worktree path contains invalid encoding.");
  }
  if (decoded !== value) {
    throw new Error("Encoded worktree paths are not accepted.");
  }
  if (
    value
      .split("/")
      .some(
        (segment) =>
          !segment || segment === "." || segment === ".." || segment === ".git",
      )
  ) {
    throw new Error("Worktree path contains unsafe traversal tokens.");
  }

  const target = resolveWorkspacePath(workspaceDir, value);
  if (existsSync(target)) {
    throw new Error("Worktree path already exists.");
  }

  let existingAncestor = dirname(target);
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const realWorkspace = realpathSync(workspaceDir);
  const realAncestor = realpathSync(existingAncestor);
  const workspacePrefix = normalize(
    realWorkspace.endsWith(sep) ? realWorkspace : `${realWorkspace}${sep}`,
  );
  if (
    realAncestor !== realWorkspace &&
    !realAncestor.startsWith(workspacePrefix)
  ) {
    throw new Error("Worktree path must stay inside the configured workspace.");
  }
  return target;
}
