import type { IpcMainInvokeEvent } from "electron";
import type {
  RepositoryMutationDesktopResult,
  RepositoryMutationRequest,
  RepositoryMutationResult,
  RepositoryWorktree,
  RepositoryWorktreeCreateRequest,
  RepositoryWorktreeCreateResult,
} from "../../shared/contracts";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { BackendManager } from "../backend";
import {
  fullyDecodeComponent,
  hasControlCharacters,
  isRecord,
} from "./input-validation";
import { parseRequestError, readBoundedResponseText } from "./runtime-http";

const API_TIMEOUT_MS = 15_000;
const MAX_COMMAND_TIMEOUT_MS = 120_000;
const MAX_WORKSPACE_PATH_LENGTH = 4_096;
const MAX_SENSITIVE_RESPONSE_BYTES = 2_000_000;

export interface RepositoryConfirmationRequest {
  kind: "worktree-create" | "repository-mutation";
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
}

type RepositoryInvokeChannel =
  | (typeof desktopIpcChannels.invoke)["repositoryCreateWorktreeConfirmed"]
  | (typeof desktopIpcChannels.invoke)["repositoryMutateConfirmed"];
type RepositoryHandler = (
  event: IpcMainInvokeEvent,
  request: unknown,
) => unknown;

export interface RegisterRepositoryIpcHandlersDependencies {
  backend: Pick<BackendManager, "getState">;
  confirmSensitiveAction: (
    request: RepositoryConfirmationRequest,
  ) => Promise<boolean>;
  sensitiveFetch: typeof fetch;
  registerHandler: (
    channel: RepositoryInvokeChannel,
    handler: RepositoryHandler,
  ) => void;
}

function validateSensitiveWorkspacePath(path: unknown): string {
  if (typeof path !== "string" || !path || path !== path.trim()) {
    throw new Error("A workspace-relative file path is required.");
  }
  if (
    path.length > MAX_WORKSPACE_PATH_LENGTH ||
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[A-Za-z]:/u.test(path) ||
    path.includes("\\") ||
    hasControlCharacters(path)
  ) {
    throw new Error("File path must be a safe workspace-relative path.");
  }
  const decoded = fullyDecodeComponent(path);
  if (decoded === null || decoded !== path) {
    throw new Error("Encoded file paths are not accepted.");
  }
  if (
    path
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("File path contains unsafe traversal tokens.");
  }
  return path;
}

export function validateWorktreeCreateRequest(
  value: unknown,
): RepositoryWorktreeCreateRequest {
  if (!isRecord(value)) {
    throw new Error("A worktree creation request is required.");
  }
  if (
    typeof value.branch !== "string" ||
    !value.branch ||
    value.branch !== value.branch.trim() ||
    value.branch.length > 255 ||
    value.branch.startsWith("-") ||
    value.branch.includes("\\") ||
    value.branch.includes("..") ||
    value.branch.includes("@{") ||
    value.branch.endsWith(".") ||
    value.branch.endsWith("/") ||
    /[\s~^:?*[\]]/u.test(value.branch) ||
    value.branch
      .split("/")
      .some((segment) => !segment || segment.endsWith(".lock")) ||
    hasControlCharacters(value.branch)
  ) {
    throw new Error("Branch name is not a valid Git branch.");
  }
  const path = validateSensitiveWorkspacePath(value.path);
  if (path.split("/").includes(".git")) {
    throw new Error("Worktree path contains an unsafe Git metadata segment.");
  }
  return { branch: value.branch, path };
}

const REPOSITORY_MUTATION_TYPES = new Set<RepositoryMutationRequest["type"]>([
  "stage",
  "unstage",
  "stage-all",
  "unstage-all",
  "discard",
  "discard-untracked",
  "stage-hunk",
  "unstage-hunk",
  "discard-hunk",
  "commit",
  "fetch",
  "pull",
  "push",
  "branch-create",
  "branch-switch",
  "branch-delete",
  "stash-create",
  "stash-apply",
  "stash-pop",
  "stash-drop",
  "worktree-remove",
  "worktree-prune",
  "remote-add",
  "remote-remove",
  "remote-set-url",
  "merge-abort",
  "merge",
  "rebase",
  "rebase-abort",
  "rebase-continue",
  "cherry-pick",
  "cherry-pick-continue",
  "cherry-pick-abort",
  "conflict-mark-resolved",
  "pr-create",
  "pr-update",
  "pr-ready",
  "pr-review",
  "pr-merge",
  "pr-close",
  "pr-reopen",
]);

function validateGitToken(
  value: unknown,
  label: string,
  maximumLength = 255,
): string {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value.length > maximumLength ||
    value.startsWith("-") ||
    hasControlCharacters(value)
  ) {
    throw new Error(`${label} is not valid.`);
  }
  return value;
}

function validateGitPaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) {
    throw new Error("Repository operations require between 1 and 500 paths.");
  }
  const paths = value.map(validateSensitiveWorkspacePath);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Repository operation paths must be unique.");
  }
  return paths;
}

function validateGitPatch(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 240_000 ||
    value.includes("\0")
  ) {
    throw new Error("A bounded unified Git patch is required.");
  }
  return value;
}

function validateRepositoryText(
  value: unknown,
  label: string,
  maximumLength: number,
  options?: { allowEmpty?: boolean },
): string {
  if (
    typeof value !== "string" ||
    (!options?.allowEmpty && !value.trim()) ||
    value.length > maximumLength ||
    value.includes("\0")
  ) {
    throw new Error(`${label} is not valid.`);
  }
  return options?.allowEmpty ? value : value.trim();
}

export function validateRepositoryMutationRequest(
  value: unknown,
): RepositoryMutationRequest {
  if (!isRecord(value) || !REPOSITORY_MUTATION_TYPES.has(value.type as never)) {
    throw new Error("A supported repository operation is required.");
  }
  const type = value.type as RepositoryMutationRequest["type"];
  switch (type) {
    case "stage":
    case "unstage":
    case "discard":
    case "discard-untracked":
    case "conflict-mark-resolved":
      return { type, paths: validateGitPaths(value.paths) };
    case "stage-hunk":
    case "unstage-hunk":
    case "discard-hunk":
      return { type, patch: validateGitPatch(value.patch) };
    case "commit":
      if (
        typeof value.message !== "string" ||
        !value.message.trim() ||
        value.message.length > 20_000 ||
        value.message.includes("\0")
      )
        throw new Error("A commit message is required.");
      return {
        type,
        message: value.message.trim(),
        amend: value.amend === true,
      };
    case "fetch": {
      const remote =
        value.remote === undefined
          ? undefined
          : validateGitToken(value.remote, "Remote");
      return remote ? { type, remote } : { type };
    }
    case "pull": {
      const remote =
        value.remote === undefined
          ? undefined
          : validateGitToken(value.remote, "Remote");
      const branch =
        value.branch === undefined
          ? undefined
          : validateGitToken(value.branch, "Branch");
      return {
        type,
        ...(remote ? { remote } : {}),
        ...(branch ? { branch } : {}),
      };
    }
    case "push": {
      const remote =
        value.remote === undefined
          ? undefined
          : validateGitToken(value.remote, "Remote");
      const branch =
        value.branch === undefined
          ? undefined
          : validateGitToken(value.branch, "Branch");
      return {
        type,
        ...(remote ? { remote } : {}),
        ...(branch ? { branch } : {}),
        setUpstream: value.setUpstream === true,
      };
    }
    case "branch-create": {
      const branch = validateGitToken(value.branch, "Branch");
      const startPoint =
        value.startPoint === undefined
          ? undefined
          : validateGitToken(value.startPoint, "Start point");
      return {
        type,
        branch,
        ...(startPoint ? { startPoint } : {}),
        checkout: value.checkout === true,
      };
    }
    case "branch-switch":
      return { type, branch: validateGitToken(value.branch, "Branch") };
    case "merge":
      return {
        type,
        branch: validateGitToken(value.branch, "Branch"),
        noFf: value.noFf === true,
      };
    case "rebase":
      return { type, branch: validateGitToken(value.branch, "Branch") };
    case "cherry-pick":
      return {
        type,
        commit: validateGitToken(value.commit, "Commit reference"),
      };
    case "branch-delete":
      return {
        type,
        branch: validateGitToken(value.branch, "Branch"),
        force: value.force === true,
      };
    case "stash-create": {
      const message =
        value.message === undefined
          ? undefined
          : validateGitToken(value.message, "Stash message", 2_000);
      return {
        type,
        ...(message ? { message } : {}),
        includeUntracked: value.includeUntracked === true,
      };
    }
    case "stash-apply":
      return {
        type,
        reference: validateGitToken(value.reference, "Stash reference"),
      };
    case "stash-pop": {
      const reference =
        value.reference === undefined
          ? undefined
          : validateGitToken(value.reference, "Stash reference");
      return reference ? { type, reference } : { type };
    }
    case "stash-drop":
      return {
        type,
        reference: validateGitToken(value.reference, "Stash reference"),
      };
    case "worktree-remove":
      return {
        type,
        path: validateGitToken(
          value.path,
          "Canonical worktree path",
          MAX_WORKSPACE_PATH_LENGTH,
        ),
        force: value.force === true,
      };
    case "remote-add":
    case "remote-set-url":
      return {
        type,
        name: validateGitToken(value.name, "Remote"),
        url: validateGitToken(value.url, "Remote URL", 2_048),
      };
    case "remote-remove":
      return { type, name: validateGitToken(value.name, "Remote") };
    case "pr-create": {
      const title = validateRepositoryText(
        value.title,
        "Pull request title",
        500,
      );
      const body =
        value.body === undefined
          ? undefined
          : validateRepositoryText(value.body, "Pull request body", 50_000, {
              allowEmpty: true,
            });
      const base =
        value.base === undefined
          ? undefined
          : validateGitToken(value.base, "Base branch");
      return {
        type,
        title,
        ...(body !== undefined ? { body } : {}),
        ...(base ? { base } : {}),
        draft: value.draft === true,
      };
    }
    case "pr-update": {
      const title =
        value.title === undefined
          ? undefined
          : validateRepositoryText(value.title, "Pull request title", 500);
      const body =
        value.body === undefined
          ? undefined
          : validateRepositoryText(value.body, "Pull request body", 50_000, {
              allowEmpty: true,
            });
      const base =
        value.base === undefined
          ? undefined
          : validateGitToken(value.base, "Base branch");
      if (title === undefined && body === undefined && base === undefined)
        throw new Error("At least one pull request field must be updated.");
      return {
        type,
        ...(title ? { title } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(base ? { base } : {}),
      };
    }
    case "pr-review": {
      const event = value.event;
      if (
        event !== "approve" &&
        event !== "request-changes" &&
        event !== "comment"
      )
        throw new Error("Pull request review event is not valid.");
      const body =
        value.body === undefined
          ? undefined
          : validateRepositoryText(value.body, "Review body", 20_000);
      if (event !== "approve" && !body)
        throw new Error("A review body is required for this review event.");
      return { type, event, ...(body ? { body } : {}) };
    }
    case "pr-merge": {
      const method = value.method;
      if (method !== "merge" && method !== "squash" && method !== "rebase")
        throw new Error("Pull request merge method is not valid.");
      return { type, method, deleteBranch: value.deleteBranch === true };
    }
    case "pr-close":
      return { type, deleteBranch: value.deleteBranch === true };
    case "stage-all":
    case "unstage-all":
    case "worktree-prune":
    case "merge-abort":
    case "rebase-abort":
    case "rebase-continue":
    case "cherry-pick-continue":
    case "cherry-pick-abort":
    case "pr-ready":
    case "pr-reopen":
      return { type };
  }
}

export function repositoryMutationConfirmation(
  request: RepositoryMutationRequest,
): Omit<RepositoryConfirmationRequest, "kind"> {
  const target =
    "paths" in request
      ? request.paths.slice(0, 3).join(", ") +
        (request.paths.length > 3
          ? ` and ${request.paths.length - 3} more`
          : "")
      : "branch" in request
        ? request.branch
        : "reference" in request && request.reference
          ? request.reference
          : "name" in request
            ? request.name
            : request.type;
  const destructive = new Set([
    "discard",
    "discard-untracked",
    "discard-hunk",
    "branch-delete",
    "stash-drop",
    "worktree-remove",
    "merge-abort",
    "rebase-abort",
    "remote-remove",
    "merge",
    "rebase",
    "cherry-pick",
    "pr-merge",
    "pr-close",
  ]).has(request.type);
  const remote =
    ["fetch", "pull", "push"].includes(request.type) ||
    request.type.startsWith("pr-");
  return {
    title: destructive
      ? "Confirm destructive Git operation"
      : remote
        ? "Confirm remote Git operation"
        : "Confirm Git operation",
    message: `${request.type.replaceAll("-", " ")}: ${target}`,
    detail: destructive
      ? "This operation can remove or overwrite local repository state. Review the exact target before continuing."
      : remote
        ? "This operation contacts the configured Git remote and may change local or remote branch state."
        : "Doolittle will run this typed Git operation in the selected repository.",
    confirmLabel: destructive ? "Continue" : "Run operation",
  };
}

async function parseSuccessfulJson(response: Response): Promise<unknown> {
  const text = await readBoundedResponseText(
    response,
    MAX_SENSITIVE_RESPONSE_BYTES,
  );
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The local runtime returned an invalid response.");
  }
}

export function registerRepositoryIpcHandlers({
  backend,
  confirmSensitiveAction,
  sensitiveFetch,
  registerHandler,
}: RegisterRepositoryIpcHandlersDependencies): void {
  const { repositoryCreateWorktreeConfirmed, repositoryMutateConfirmed } =
    desktopIpcChannels.invoke;
  registerHandler(
    repositoryCreateWorktreeConfirmed,
    async (_event, unsafeRequest): Promise<RepositoryWorktreeCreateResult> => {
      const request = validateWorktreeCreateRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "worktree-create",
        title: "Create Git worktree?",
        message: request.branch,
        detail: `Doolittle will create a new branch and worktree at ${request.path}, inside the selected workspace.`,
        confirmLabel: "Create worktree",
      });
      if (!confirmed) return { status: "cancelled" };
      const state = backend.getState();
      if (state.phase !== "ready" || !state.url)
        throw new Error("The local runtime is not ready.");
      const response = await sensitiveFetch(
        `${state.url}/repo/worktrees/create`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        },
      );
      if (!response.ok)
        throw new Error(
          `Worktree creation failed: ${(await parseRequestError(response)).trim()}`,
        );
      const payload = await parseSuccessfulJson(response);
      const worktree = isRecord(payload) ? payload.worktree : undefined;
      if (
        !isRecord(worktree) ||
        typeof worktree.path !== "string" ||
        !worktree.path ||
        typeof worktree.detached !== "boolean" ||
        typeof worktree.bare !== "boolean" ||
        typeof worktree.prunable !== "boolean"
      )
        throw new Error("The local runtime did not confirm the new worktree.");
      const confirmedWorktree: RepositoryWorktree = {
        path: worktree.path,
        detached: worktree.detached,
        bare: worktree.bare,
        prunable: worktree.prunable,
      };
      if (typeof worktree.head === "string")
        confirmedWorktree.head = worktree.head;
      if (typeof worktree.branch === "string")
        confirmedWorktree.branch = worktree.branch;
      return { status: "created", worktree: confirmedWorktree };
    },
  );
  registerHandler(
    repositoryMutateConfirmed,
    async (_event, unsafeRequest): Promise<RepositoryMutationDesktopResult> => {
      const request = validateRepositoryMutationRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "repository-mutation",
        ...repositoryMutationConfirmation(request),
      });
      if (!confirmed) return { status: "cancelled" };
      const state = backend.getState();
      if (state.phase !== "ready" || !state.url)
        throw new Error("The local runtime is not ready.");
      const response = await sensitiveFetch(`${state.url}/repo/mutate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(MAX_COMMAND_TIMEOUT_MS),
      });
      if (!response.ok)
        throw new Error(
          `Git operation failed: ${(await parseRequestError(response)).trim()}`,
        );
      const payload = await parseSuccessfulJson(response);
      const result = isRecord(payload) ? payload.result : undefined;
      if (
        !isRecord(result) ||
        result.type !== request.type ||
        typeof result.ok !== "boolean" ||
        typeof result.summary !== "string" ||
        typeof result.stdout !== "string" ||
        typeof result.stderr !== "string" ||
        typeof result.exitCode !== "number"
      )
        throw new Error("The local runtime returned an invalid Git result.");
      const validatedResult: RepositoryMutationResult = {
        type: request.type,
        ok: result.ok,
        summary: result.summary,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
      if (typeof result.error === "string")
        validatedResult.error = result.error;
      return { status: "completed", result: validatedResult };
    },
  );
}
