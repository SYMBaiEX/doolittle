import { randomUUID } from "node:crypto";
import type { RepositoryMutationRequest } from "@doolittle/contracts/repository";
import type { AppContext } from "../../runtime/bootstrap/index";
import {
  type NativeWorkspaceAdmission,
  NativeWorkspaceChangedError,
} from "../../runtime/execution-admission";
import { NativeRepositoryScopeError } from "../../services/repository-service";
import { nativeWorkspaceAdmissionError } from "../native-client-policy";
import { invalidJsonObjectBody, readJsonObjectBody } from "../request-body";
import { json } from "../responses";

type MutationType = RepositoryMutationRequest["type"];
type RequestField = readonly [name: string, kind: "text" | "boolean" | "paths"];
const text = (name: string): RequestField => [name, "text"];
const flag = (name: string): RequestField => [name, "boolean"];
const paths: RequestField = ["paths", "paths"];
// The repository service still owns argument, ref, patch, and operation-state
// validation. This table limits the native transport to known DTO fields.
const MUTATION_FIELDS = {
  stage: [paths],
  unstage: [paths],
  "stage-all": [],
  "unstage-all": [],
  discard: [paths],
  "discard-untracked": [paths],
  "stage-hunk": [text("patch")],
  "unstage-hunk": [text("patch")],
  "discard-hunk": [text("patch")],
  commit: [text("message"), flag("amend")],
  fetch: [text("remote")],
  pull: [text("remote"), text("branch")],
  push: [text("remote"), text("branch"), flag("setUpstream")],
  "branch-create": [text("branch"), text("startPoint"), flag("checkout")],
  "branch-switch": [text("branch")],
  "branch-delete": [text("branch"), flag("force")],
  "stash-create": [text("message"), flag("includeUntracked")],
  "stash-apply": [text("reference")],
  "stash-pop": [text("reference")],
  "stash-drop": [text("reference")],
  "remote-add": [text("name"), text("url")],
  "remote-remove": [text("name")],
  "remote-set-url": [text("name"), text("url")],
  "merge-abort": [],
  merge: [text("branch"), flag("noFf")],
  rebase: [text("branch")],
  "rebase-abort": [],
  "rebase-continue": [],
  "cherry-pick": [text("commit")],
  "cherry-pick-continue": [],
  "cherry-pick-abort": [],
  "conflict-mark-resolved": [paths],
  "pr-create": [text("title"), text("body"), text("base"), flag("draft")],
  "pr-update": [text("title"), text("body"), text("base")],
  "pr-ready": [],
  "pr-review": [text("event"), text("body")],
  "pr-merge": [text("method"), flag("deleteBranch")],
  "pr-close": [flag("deleteBranch")],
  "pr-reopen": [],
  // Removing/pruning a linked worktree requires authority over that tree too.
} satisfies Record<
  Exclude<MutationType, "worktree-remove" | "worktree-prune">,
  readonly RequestField[]
>;

type NativeMutationType = keyof typeof MUTATION_FIELDS;

const REVERSIBLE_INDEX_UPDATES = new Set<MutationType>([
  "stage",
  "unstage",
  "stage-all",
  "unstage-all",
  "stage-hunk",
  "unstage-hunk",
]);

function validRepositoryPaths(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 500 &&
    new Set(value).size === value.length &&
    value.every((path) => {
      if (
        typeof path !== "string" ||
        !path ||
        path !== path.trim() ||
        path.length > 4096 ||
        /^[A-Za-z]:/u.test(path) ||
        path.startsWith(":") ||
        /[\\\p{Cc}\p{Cf}]/u.test(path) ||
        path
          .split("/")
          .some(
            (segment) =>
              !segment ||
              segment === "." ||
              segment === ".." ||
              segment.toLowerCase() === ".git",
          )
      )
        return false;
      try {
        return decodeURIComponent(path) === path;
      } catch {
        return false;
      }
    })
  );
}

function validRemoteUrl(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\s\p{Cc}\p{Cf}]/u.test(value)
  )
    return false;
  // Standard scp-style SSH remotes, or ordinary Git network protocols. Reject
  // custom remote helpers and URLs with embedded authentication material.
  if (/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+:[^:]+$/u.test(value)) return true;
  try {
    const url = new URL(value);
    return (
      ["https:", "http:", "ssh:", "git:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!url.username || url.protocol === "ssh:")
    );
  } catch {
    return false;
  }
}

function readMutation(
  value: Record<string, unknown>,
): RepositoryMutationRequest | undefined {
  const { workspace: _workspace, confirmed, ...mutation } = value;
  if (
    typeof mutation.type !== "string" ||
    !Object.hasOwn(MUTATION_FIELDS, mutation.type) ||
    (confirmed !== undefined && typeof confirmed !== "boolean")
  )
    return undefined;
  const fields: readonly RequestField[] =
    MUTATION_FIELDS[mutation.type as NativeMutationType];
  for (const [key, input] of Object.entries(mutation)) {
    if (key === "type") continue;
    const descriptor = fields.find(([name]) => name === key);
    if (!descriptor) return undefined;
    switch (descriptor[1]) {
      case "paths":
        if (!validRepositoryPaths(input)) return undefined;
        break;
      case "boolean":
        if (typeof input !== "boolean") return undefined;
        break;
      case "text":
        if (typeof input !== "string" || input.includes("\0")) return undefined;
        break;
    }
  }
  if (
    (mutation.type === "remote-add" || mutation.type === "remote-set-url") &&
    !validRemoteUrl(mutation.url)
  )
    return undefined;
  return mutation as unknown as RepositoryMutationRequest;
}

export async function handleNativeRepositoryMutation(
  context: AppContext,
  request: Request,
  admission: NativeWorkspaceAdmission,
): Promise<Response> {
  const body = await readJsonObjectBody(request);
  if (!body.ok) return invalidJsonObjectBody(body.reason);
  const mutation = readMutation(body.value);
  if (!mutation)
    return json(
      { error: "A supported, typed Git operation is required." },
      400,
    );
  if (
    !REVERSIBLE_INDEX_UPDATES.has(mutation.type) &&
    body.value.confirmed !== true
  )
    return json(
      {
        error: "Confirm the Git operation in the native desktop first.",
        code: "repository_confirmation_required",
      },
      403,
    );
  const workspace = context.config.workspaceDir;
  if (body.value.workspace !== workspace)
    return json(
      {
        error:
          "The Git request does not match this window's selected workspace.",
        code: "repository_scope_mismatch",
      },
      409,
    );

  let lease: ReturnType<NativeWorkspaceAdmission["claim"]> | undefined;
  try {
    request.signal.throwIfAborted();
    lease = admission.claim({
      runId: `native-git:${randomUUID()}`,
      sessionId: "native-git",
    });
    return json({
      result: await context.services.repository.mutate(mutation, {
        workspaceRoot: workspace,
        revalidate() {
          request.signal.throwIfAborted();
          admission.assertCurrent();
          if (context.config.workspaceDir !== workspace)
            throw new NativeRepositoryScopeError();
        },
      }),
    });
  } catch (error) {
    if (error instanceof NativeRepositoryScopeError)
      return json(
        { error: error.message, code: "repository_scope_mismatch" },
        409,
      );
    if (
      !lease ||
      request.signal.aborted ||
      error instanceof NativeWorkspaceChangedError
    )
      return nativeWorkspaceAdmissionError(error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid repository mutation.",
      },
      400,
    );
  } finally {
    // Once launched, Git owns the operation through settlement even if the
    // HTTP client disconnects. Never admit editor/agent writes early.
    await lease?.release();
  }
}
