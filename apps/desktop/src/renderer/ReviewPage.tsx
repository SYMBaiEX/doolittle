import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  RepositoryReview,
  RepositoryReviewCheck,
  RepositoryReviewResponse,
  RepositoryWorkflowRun,
} from "../shared/contracts";
import type { ChatContextRequest } from "./chat-context-handoff";
import { GitControlPanel } from "./components/GitControlPanel";
import { GitHubPullRequestPanel } from "./components/GitHubPullRequestPanel";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  useApiResource,
} from "./lib";
import type { RepositoryControlChange } from "./repository-control";
import {
  compileReviewFeedback,
  createReviewComment,
  loadReviewComments,
  mergeReviewComments,
  parseReviewPatchLines,
  type ReviewComment,
  type ReviewCommentAnchor,
  type ReviewRecordResponse,
  reviewCommentIdentity,
  reviewRecordMatchesIdentity,
  saveReviewComments,
} from "./review-comments";
import { reviewWorkState } from "./review-work-state";
import "./review.css";

type ReviewFilter = "all" | "approvals" | "ci" | "changes";
type ReviewKind = Exclude<ReviewFilter, "all">;

const REVIEW_FILTERS: ReadonlyArray<{
  id: ReviewFilter;
  label: string;
}> = [
  { id: "all", label: "Activity" },
  { id: "approvals", label: "Needs you" },
  { id: "changes", label: "Files" },
  { id: "ci", label: "Checks" },
];

interface ReviewItem {
  id: string;
  kind: ReviewKind;
  title: string;
  description: string;
  status: string;
  timestamp?: string;
  path?: string;
  raw: Record<string, unknown>;
}

interface ApprovalResponse {
  approvals?: unknown[];
}

interface ChangesResponse {
  changes?: unknown[];
}
interface RepositoryBranchesResponse {
  branches?: unknown[];
}
interface RepositoryRemotesResponse {
  remotes?: unknown[];
}
interface RepositoryStashesResponse {
  stashes?: unknown[];
}
interface RepositoryConflictsResponse {
  conflicts?: unknown[];
}
interface RepositoryWorktreesResponse {
  worktrees?: unknown[];
}

interface RunsResponse {
  runs?: unknown[];
}

interface PatchResponse {
  patch?: {
    patch?: string;
    truncated?: boolean;
  };
}

function recordEventLabel(type: string): string {
  return type.replaceAll("_", " ");
}

function gitChanges(value: ChangesResponse | null): RepositoryControlChange[] {
  return asArray(value?.changes).flatMap((entry) => {
    const record = asRecord(entry);
    const path = asString(record.path);
    if (!path) return [];
    return [
      {
        path,
        status:
          `${asString(record.indexStatus)}${asString(record.worktreeStatus)}`.trim(),
        staged: Boolean(record.staged),
        unstaged: Boolean(record.unstaged),
        untracked: Boolean(record.untracked),
      },
    ];
  });
}

function gitRecords<T>(value: unknown[] | undefined): T[] {
  return asArray(value) as T[];
}

function statusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  const value = status.toLowerCase();
  if (
    ["approved", "completed", "success", "used", "clean", "passed"].includes(
      value,
    )
  )
    return "good";
  if (
    [
      "denied",
      "failed",
      "failure",
      "cancelled",
      "expired",
      "error",
      "changes requested",
      "changes_requested",
    ].includes(value)
  )
    return "bad";
  if (
    [
      "pending",
      "queued",
      "in_progress",
      "running",
      "staged",
      "working",
      "draft",
      "blocked",
    ].includes(value)
  )
    return "warn";
  return "neutral";
}

function checkDisplayStatus(check: RepositoryReviewCheck): string {
  const conclusion = check.conclusion?.toLowerCase();
  if (conclusion) {
    if (["success", "neutral", "skipped"].includes(conclusion)) {
      return conclusion === "success" ? "passed" : conclusion;
    }
    return conclusion;
  }
  return check.status;
}

function workflowDisplayStatus(run: RepositoryWorkflowRun): string {
  return run.conclusion?.toLowerCase() || run.status;
}

function compactCommand(command: string): string {
  const normalized = command.replace(/\s+/gu, " ").trim();
  return normalized.length > 110 ? `${normalized.slice(0, 109)}…` : normalized;
}

function reviewItems(
  approvals: ApprovalResponse | null,
  changes: ChangesResponse | null,
  repositoryReview: RepositoryReview | undefined,
): ReviewItem[] {
  const approvalItems = asArray(approvals?.approvals).map((value, index) => {
    const record = asRecord(value);
    const id = asString(record.id, `approval-${index}`);
    return {
      id: `approvals:${id}`,
      kind: "approvals" as const,
      title: compactCommand(asString(record.command, "Command approval")),
      description: asString(
        record.reason,
        "The local agent requested permission to run this command.",
      ),
      status: asString(record.status, "pending"),
      timestamp: asString(record.createdAt) || undefined,
      raw: record,
    };
  });

  const changeItems = asArray(changes?.changes).map((value, index) => {
    const record = asRecord(value);
    const path = asString(record.path, `change-${index}`);
    const staged = Boolean(record.staged);
    const unstaged = Boolean(record.unstaged);
    const untracked = Boolean(record.untracked);
    return {
      id: `changes:${path}`,
      kind: "changes" as const,
      title: path.split("/").at(-1) ?? path,
      description: path,
      status: untracked
        ? "untracked"
        : staged && !unstaged
          ? "staged"
          : "working",
      timestamp: undefined,
      path,
      raw: record,
    };
  });

  const pullRequestItems: ReviewItem[] = repositoryReview?.pullRequest
    ? [
        {
          id: `ci:pr:${repositoryReview.pullRequest.number}`,
          kind: "ci",
          title: `#${repositoryReview.pullRequest.number} ${repositoryReview.pullRequest.title}`,
          description: `${repositoryReview.repository?.slug ?? "GitHub"} · ${
            repositoryReview.pullRequest.headRefName ??
            repositoryReview.branch ??
            "current branch"
          } → ${repositoryReview.pullRequest.baseRefName ?? "base"}`,
          status: repositoryReview.pullRequest.isDraft
            ? "draft"
            : repositoryReview.pullRequest.reviewDecision
                ?.toLowerCase()
                .replaceAll("_", " ") ||
              repositoryReview.pullRequest.mergeStateStatus
                ?.toLowerCase()
                .replaceAll("_", " ") ||
              repositoryReview.pullRequest.state,
          timestamp: repositoryReview.pullRequest.updatedAt,
          raw: {
            ...repositoryReview.pullRequest,
            category: "pull-request",
          },
        },
      ]
    : [];

  const checkItems: ReviewItem[] = (repositoryReview?.checks ?? []).map(
    (check, index) => ({
      id: `ci:check:${index}:${check.name}`,
      kind: "ci",
      title: check.name,
      description: check.workflow
        ? `${check.workflow} check`
        : "Pull request check",
      status: checkDisplayStatus(check),
      timestamp: check.completedAt ?? check.startedAt,
      raw: { ...check, category: "check" },
    }),
  );

  const workflowItems: ReviewItem[] = (
    repositoryReview?.workflowRuns ?? []
  ).map((run) => ({
    id: `ci:workflow:${run.id}`,
    kind: "ci",
    title: run.name,
    description: `${run.event ?? "workflow"} · ${
      run.headBranch ?? repositoryReview?.branch ?? "current branch"
    }`,
    status: workflowDisplayStatus(run),
    timestamp: run.updatedAt ?? run.createdAt,
    raw: { ...run, category: "workflow-run" },
  }));

  return [
    ...approvalItems,
    ...pullRequestItems,
    ...checkItems,
    ...changeItems,
    ...workflowItems,
  ].sort((left, right) => {
    const priority = (item: ReviewItem): number => {
      if (item.kind === "approvals" && item.status === "pending") return 100;
      if (item.kind === "ci" && statusTone(item.status) === "bad") return 90;
      if (item.kind === "ci" && statusTone(item.status) === "warn") return 80;
      return 0;
    };
    const leftPriority = priority(left);
    const rightPriority = priority(right);
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
    return (right.timestamp ?? "").localeCompare(left.timestamp ?? "");
  });
}

export function reviewWorkspaceScopeKey(
  workspacePath: string,
  projectScope: string,
): string {
  return `${workspacePath}\u0000${projectScope}`;
}

export function ReviewPage({
  active,
  embedded = false,
  onSendToChat,
  projectScope,
  workspacePath,
}: {
  active: boolean;
  embedded?: boolean;
  onSendToChat: (request: ChatContextRequest) => void;
  projectScope: string;
  workspacePath: string;
}) {
  const scopeKey = reviewWorkspaceScopeKey(workspacePath, projectScope);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const commentEditorRef = useRef<HTMLTextAreaElement>(null);
  const migratedRecordRef = useRef("");
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "good" | "bad" | "warn";
    message: string;
  } | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentTarget, setCommentTarget] = useState<{
    path: string;
    anchor?: ReviewCommentAnchor;
  } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState("");

  const approvals = useApiResource<ApprovalResponse>(
    active ? "/execution/approvals" : null,
    [active, scopeKey],
  );
  const changes = useApiResource<ChangesResponse>(
    active ? "/repo/changes" : null,
    [active, scopeKey],
  );
  const branches = useApiResource<RepositoryBranchesResponse>(
    active ? "/repo/branches" : null,
    [active, scopeKey],
  );
  const remotes = useApiResource<RepositoryRemotesResponse>(
    active ? "/repo/remotes" : null,
    [active, scopeKey],
  );
  const stashes = useApiResource<RepositoryStashesResponse>(
    active ? "/repo/stashes" : null,
    [active, scopeKey],
  );
  const conflicts = useApiResource<RepositoryConflictsResponse>(
    active ? "/repo/conflicts" : null,
    [active, scopeKey],
  );
  const worktrees = useApiResource<RepositoryWorktreesResponse>(
    active ? "/repo/worktrees" : null,
    [active, scopeKey],
  );
  const runs = useApiResource<RunsResponse>(active ? "/codegen/runs" : null, [
    active,
    scopeKey,
  ]);
  const repositoryReview = useApiResource<RepositoryReviewResponse>(
    active ? "/repo/review" : null,
    [active, scopeKey],
  );
  const branchRecord = useApiResource<ReviewRecordResponse>(
    active ? "/review-record?limit=80" : null,
    [active, scopeKey],
  );
  const review = repositoryReview.data?.review;
  const commentIdentity = useMemo(
    () => reviewCommentIdentity(review),
    [review],
  );
  const items = useMemo(
    () => reviewItems(approvals.data, changes.data, review),
    [approvals.data, changes.data, review],
  );
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.kind !== filter) return false;
      if (!normalizedQuery) return true;
      return [item.title, item.description, item.status, item.kind].some(
        (value) => value.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [filter, items, query]);
  const selected =
    visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0];
  const activeCommentTarget =
    commentTarget?.path === selected?.path ? commentTarget : null;
  const patch = useApiResource<PatchResponse>(
    active && selected?.kind === "changes" && selected.path
      ? `/repo/patch?path=${encodeURIComponent(selected.path)}&staged=${
          selected.status === "staged"
        }`
      : null,
    [active, selected?.id],
  );
  const pendingCount = items.filter(
    (item) => item.kind === "approvals" && item.status === "pending",
  ).length;
  const checkSummary = (review?.checks ?? []).reduce(
    (summary, check) => {
      const tone = statusTone(checkDisplayStatus(check));
      if (tone === "good") summary.passing += 1;
      else if (tone === "bad") summary.failing += 1;
      else summary.pending += 1;
      return summary;
    },
    { passing: 0, failing: 0, pending: 0 },
  );
  const changedFileCount = gitChanges(changes.data).length;
  const agentRunCount = asArray(runs.data?.runs).length;
  const workState = reviewWorkState({
    failingChecks: checkSummary.failing,
    pendingApprovals: pendingCount,
    changedFiles: changedFileCount,
    agentRuns: agentRunCount,
  });
  const selectedPathComments = useMemo(
    () =>
      selected?.path
        ? comments.filter((comment) => comment.path === selected.path)
        : [],
    [comments, selected?.path],
  );
  const openCommentCount = comments.filter(
    (comment) => comment.status === "open",
  ).length;
  const branchScope = branchRecord.data?.record.scope;
  const branchEvents =
    branchRecord.data?.record.events.slice(-8).reverse() ?? [];

  useEffect(() => {
    if (!selected) setSelectedId("");
    else if (!visibleItems.some((item) => item.id === selectedId))
      setSelectedId(selected.id);
  }, [selected, selectedId, visibleItems]);

  useEffect(() => {
    if (!active) return;
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [active]);

  useEffect(() => {
    setComments(loadReviewComments(commentIdentity, window.localStorage));
    setCommentTarget(null);
    setCommentDraft("");
    setEditingCommentId("");
  }, [commentIdentity]);

  useEffect(() => {
    const record = branchRecord.data?.record;
    if (
      !active ||
      !record ||
      !reviewRecordMatchesIdentity(commentIdentity, record.scope)
    ) {
      return;
    }
    const local = loadReviewComments(commentIdentity, window.localStorage);
    const merged = mergeReviewComments(local, record.comments);
    setComments(merged);
    saveReviewComments(commentIdentity, merged, window.localStorage);
  }, [active, branchRecord.data, commentIdentity]);

  useEffect(() => {
    const migrationKey = commentIdentity.storageKey;
    if (
      !active ||
      branchRecord.loading ||
      branchRecord.error ||
      !branchRecord.data?.record ||
      !reviewRecordMatchesIdentity(
        commentIdentity,
        branchRecord.data.record.scope,
      ) ||
      migratedRecordRef.current === migrationKey
    ) {
      return;
    }
    const legacyComments = loadReviewComments(
      commentIdentity,
      window.localStorage,
    );
    if (legacyComments.length === 0) return;
    migratedRecordRef.current = migrationKey;
    let cancelled = false;
    void desktopRequest<ReviewRecordResponse>(
      "/review-record/comments/migrate",
      "POST",
      { comments: legacyComments },
    )
      .then((response) => {
        if (cancelled) return;
        const merged = mergeReviewComments(
          legacyComments,
          response.record.comments,
        );
        setComments(merged);
        saveReviewComments(commentIdentity, merged, window.localStorage);
        branchRecord.reload();
      })
      .catch(() => {
        // The browser-local record remains the truthful offline fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [
    active,
    branchRecord.error,
    branchRecord.data?.record,
    branchRecord.loading,
    branchRecord.reload,
    commentIdentity,
  ]);

  const reload = () => {
    approvals.reload();
    changes.reload();
    runs.reload();
    repositoryReview.reload();
    branchRecord.reload();
    branches.reload();
    remotes.reload();
    stashes.reload();
    conflicts.reload();
    worktrees.reload();
    if (selected?.kind === "changes") patch.reload();
  };

  const persistComments = (nextComments: ReviewComment[]) => {
    setComments(nextComments);
    saveReviewComments(commentIdentity, nextComments, window.localStorage);
  };

  const applyDurableRecord = (response: ReviewRecordResponse) => {
    persistComments(response.record.comments);
    branchRecord.reload();
  };

  const showOfflineFallback = (error: unknown) => {
    setFeedback({
      tone: "warn",
      message: `Saved only in this app until the local runtime returns: ${errorMessage(error)}`,
    });
  };

  const startComment = (
    path: string,
    anchor?: ReviewCommentAnchor,
    existing?: ReviewComment,
  ) => {
    setCommentTarget({ path, anchor });
    setCommentDraft(existing?.body ?? "");
    setEditingCommentId(existing?.id ?? "");
    requestAnimationFrame(() => commentEditorRef.current?.focus());
  };

  const cancelComment = () => {
    setCommentTarget(null);
    setCommentDraft("");
    setEditingCommentId("");
  };

  const saveComment = async () => {
    if (!commentTarget || !commentDraft.trim()) return;
    const now = new Date().toISOString();
    if (editingCommentId) {
      const nextComments = comments.map((comment) =>
        comment.id === editingCommentId
          ? {
              ...comment,
              body: commentDraft.trim().slice(0, 2_000),
              updatedAt: now,
            }
          : comment,
      );
      persistComments(nextComments);
      try {
        applyDurableRecord(
          await desktopRequest<ReviewRecordResponse>(
            `/review-record/comments/${encodeURIComponent(editingCommentId)}`,
            "PATCH",
            { body: commentDraft.trim() },
          ),
        );
      } catch (error) {
        showOfflineFallback(error);
      }
    } else {
      const comment = createReviewComment({
        id:
          globalThis.crypto?.randomUUID?.() ??
          `review-${Date.now()}-${comments.length}`,
        path: commentTarget.path,
        anchor: commentTarget.anchor,
        body: commentDraft,
        now,
      });
      persistComments([...comments, comment]);
      try {
        applyDurableRecord(
          await desktopRequest<ReviewRecordResponse>(
            "/review-record/comments",
            "POST",
            { comment },
          ),
        );
      } catch (error) {
        showOfflineFallback(error);
      }
    }
    cancelComment();
  };

  const toggleCommentResolved = async (commentId: string) => {
    const now = new Date().toISOString();
    const selectedComment = comments.find(
      (comment) => comment.id === commentId,
    );
    const nextStatus = selectedComment?.status === "open" ? "resolved" : "open";
    persistComments(
      comments.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              status: comment.status === "open" ? "resolved" : "open",
              updatedAt: now,
            }
          : comment,
      ),
    );
    try {
      applyDurableRecord(
        await desktopRequest<ReviewRecordResponse>(
          `/review-record/comments/${encodeURIComponent(commentId)}/${
            nextStatus === "resolved" ? "resolve" : "reopen"
          }`,
          "POST",
        ),
      );
    } catch (error) {
      showOfflineFallback(error);
    }
  };

  const deleteComment = async (commentId: string) => {
    persistComments(comments.filter((comment) => comment.id !== commentId));
    if (editingCommentId === commentId) cancelComment();
    try {
      applyDurableRecord(
        await desktopRequest<ReviewRecordResponse>(
          `/review-record/comments/${encodeURIComponent(commentId)}`,
          "DELETE",
        ),
      );
    } catch (error) {
      showOfflineFallback(error);
    }
  };

  const sendReviewFeedback = async () => {
    if (openCommentCount === 0) return;
    onSendToChat({
      text: compileReviewFeedback({
        identity: commentIdentity,
        comments,
      }),
      workspacePath,
      projectScope,
    });
    try {
      applyDurableRecord(
        await desktopRequest<ReviewRecordResponse>(
          "/review-record/feedback-sent",
          "POST",
        ),
      );
    } catch (error) {
      showOfflineFallback(error);
    }
  };

  const decideApproval = async (decision: "approve" | "deny") => {
    if (!selected || selected.kind !== "approvals") return;
    const approvalId = asString(selected.raw.id);
    if (!approvalId) return;
    setBusy(decision);
    setFeedback(null);
    try {
      await desktopRequest(
        `/execution/approvals/${encodeURIComponent(approvalId)}/${decision}`,
        "POST",
        {},
      );
      setFeedback({
        tone: decision === "approve" ? "good" : "warn",
        message:
          decision === "approve"
            ? "Approval granted. The agent may use it for the matching command."
            : "Request denied. No command was executed.",
      });
      approvals.reload();
    } catch (error) {
      setFeedback({ tone: "bad", message: errorMessage(error) });
    } finally {
      setBusy("");
    }
  };

  const loading =
    approvals.loading ||
    changes.loading ||
    runs.loading ||
    repositoryReview.loading;
  const sourceErrors = [
    approvals.error,
    changes.error,
    runs.error,
    repositoryReview.error,
  ].filter(Boolean);
  const blockingError =
    items.length === 0 && sourceErrors.length === 4
      ? (sourceErrors[0] ?? "")
      : "";
  const selectFilterAt = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = REVIEW_FILTERS[index];
    if (!next) return;
    const tablist = event.currentTarget.parentElement;
    setFilter(next.id);
    requestAnimationFrame(() => {
      tablist
        ?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
        [index]?.focus();
    });
  };

  return (
    <div
      className={`page review-page${embedded ? " review-page--embedded" : ""}`}
      data-project-scope={projectScope}
      data-workspace-path={workspacePath}
    >
      {!embedded ? (
        <header className="review-header">
          <div>
            <span className="eyebrow">Agent work</span>
            <h1>Review what Doolittle did</h1>
            <p>
              Inspect the outcome, changed files, verification, and decisions
              from completed work without reconstructing the agent’s entire
              chat.
            </p>
          </div>
          <div className="review-header-status">
            <span>
              <strong>{pendingCount}</strong> needs you
            </span>
            <span>
              <strong>{items.length}</strong> work events
            </span>
            <button
              className="secondary-button"
              disabled={!active}
              onClick={reload}
              type="button"
            >
              Refresh
            </button>
          </div>
        </header>
      ) : null}

      <section
        aria-label="Current agent work outcome"
        className={`review-work-overview ${workState.tone}`}
      >
        <div className="review-work-outcome">
          <i aria-hidden="true">{workState.icon}</i>
          <span>
            <small>Current workset</small>
            <strong>{workState.title}</strong>
            <p>{workState.detail}</p>
          </span>
        </div>
        <dl className="review-work-metrics">
          <div>
            <dt>Agent runs</dt>
            <dd>{agentRunCount}</dd>
          </div>
          <div>
            <dt>Files changed</dt>
            <dd>{changedFileCount}</dd>
          </div>
          <div>
            <dt>Checks passed</dt>
            <dd>{checkSummary.passing}</dd>
          </div>
          <div className={openCommentCount ? "warn" : ""}>
            <dt>Open notes</dt>
            <dd>{openCommentCount}</dd>
          </div>
        </dl>
        <div className="review-work-revision">
          <small>Revision</small>
          <strong>
            {branchScope?.branch ?? review?.local.branch ?? "workspace"}
          </strong>
          <code>
            {(branchScope?.head ?? review?.local.head ?? "working-tree").slice(
              0,
              12,
            )}
          </code>
        </div>
      </section>

      <details className="review-evidence-drawer">
        <summary>
          <span>
            <strong>Repository evidence</strong>
            <small>
              {changedFileCount} changed · {checkSummary.passing} passed ·{" "}
              {checkSummary.failing} failed
              {review?.pullRequest ? ` · PR #${review.pullRequest.number}` : ""}
            </small>
          </span>
          <i aria-hidden="true">›</i>
        </summary>
        <div className="review-evidence-body">
          {repositoryReview.error ? (
            <Notice tone="warn">
              GitHub review is unavailable. Local evidence remains reviewable.
            </Notice>
          ) : (
            <GitHubPullRequestPanel
              active={active}
              onRefresh={reload}
              review={review}
            />
          )}
          <section aria-label="Branch record" className="review-branch-record">
            <div className="review-branch-record-heading">
              <span className="eyebrow">Branch record</span>
              <strong>
                {branchScope?.branch ?? review?.local.branch ?? "detached"}
              </strong>
              <code>
                {(
                  branchScope?.head ??
                  review?.local.head ??
                  "working-tree"
                ).slice(0, 12)}
              </code>
              <Badge tone={branchRecord.error ? "warn" : "good"}>
                {branchRecord.error ? "local-only fallback" : "durable local"}
              </Badge>
            </div>
            <div className="review-branch-evidence">
              <span>
                <strong>{checkSummary.passing}</strong> checks passing
              </span>
              <span className={checkSummary.failing ? "bad" : ""}>
                <strong>{checkSummary.failing}</strong> failing
              </span>
              <span className={pendingCount ? "warn" : ""}>
                <strong>{pendingCount}</strong> approvals
              </span>
              <span>
                <strong>{agentRunCount}</strong> agent runs
              </span>
              <span>
                <strong>{openCommentCount}</strong> open notes
              </span>
            </div>
            <ol className="review-branch-events">
              {branchEvents.length > 0 ? (
                branchEvents.map((event) => (
                  <li key={event.id}>
                    <span>{recordEventLabel(event.type)}</span>
                    <p>{event.detail}</p>
                    <time>{displayTimestamp(event.createdAt)}</time>
                  </li>
                ))
              ) : (
                <li className="empty">
                  <span>No review events yet</span>
                  <p>Decisions and feedback will be retained here.</p>
                </li>
              )}
            </ol>
          </section>
          <details className="review-git-controls">
            <summary>
              Source control · {changedFileCount} changes
              {conflicts.data?.conflicts?.length
                ? ` · ${conflicts.data.conflicts.length} conflicts`
                : ""}
            </summary>
            <GitControlPanel
              active={active && review?.local.isRepository !== false}
              branches={gitRecords<RepositoryBranch>(branches.data?.branches)}
              changes={gitChanges(changes.data)}
              conflicts={gitRecords<RepositoryConflict>(
                conflicts.data?.conflicts,
              )}
              onRefresh={reload}
              remotes={gitRecords<RepositoryRemote>(remotes.data?.remotes)}
              stashes={gitRecords<RepositoryStash>(stashes.data?.stashes)}
              variant="full"
              worktrees={gitRecords<{
                path: string;
                branch?: string;
                current?: boolean;
                prunable?: boolean;
              }>(worktrees.data?.worktrees)}
            />
          </details>
        </div>
      </details>

      {feedback ? (
        <Notice tone={feedback.tone}>{feedback.message}</Notice>
      ) : null}
      {!blockingError && sourceErrors.length > 0 ? (
        <Notice tone="warn">
          {sourceErrors.length} review{" "}
          {sourceErrors.length === 1 ? "source is" : "sources are"} unavailable.
          Local evidence and every connected source remain reviewable.
        </Notice>
      ) : null}
      {blockingError ? (
        <ErrorBlock error={blockingError} retry={reload} />
      ) : loading && items.length === 0 ? (
        <LoadingBlock label="Assembling completed work…" />
      ) : (
        <div className="review-workspace">
          <aside className="review-rail">
            <div
              aria-label="Review filters"
              className="review-tabs"
              role="tablist"
            >
              {REVIEW_FILTERS.map(({ id, label }, index) => (
                <button
                  aria-controls="review-filter-panel"
                  aria-selected={filter === id}
                  className={filter === id ? "selected" : ""}
                  id={`review-filter-${id}`}
                  key={id}
                  onClick={() => setFilter(id)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "ArrowRight" ||
                      event.key === "ArrowDown"
                    ) {
                      event.preventDefault();
                      selectFilterAt(
                        event,
                        (index + 1) % REVIEW_FILTERS.length,
                      );
                    } else if (
                      event.key === "ArrowLeft" ||
                      event.key === "ArrowUp"
                    ) {
                      event.preventDefault();
                      selectFilterAt(
                        event,
                        (index - 1 + REVIEW_FILTERS.length) %
                          REVIEW_FILTERS.length,
                      );
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      selectFilterAt(event, 0);
                    } else if (event.key === "End") {
                      event.preventDefault();
                      selectFilterAt(event, REVIEW_FILTERS.length - 1);
                    }
                  }}
                  role="tab"
                  tabIndex={filter === id ? 0 : -1}
                  type="button"
                >
                  {label}
                  <span>
                    {id === "all"
                      ? items.length
                      : items.filter((item) => item.kind === id).length}
                  </span>
                </button>
              ))}
            </div>
            <label className="review-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search review queue"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search decisions and changes"
                ref={searchRef}
                type="search"
                value={query}
              />
              {query ? (
                <button
                  aria-label="Clear review search"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  ×
                </button>
              ) : (
                <kbd>
                  {window.doolittle.platform === "darwin" ? "⌘F" : "Ctrl F"}
                </kbd>
              )}
            </label>
            <div
              aria-labelledby={`review-filter-${filter}`}
              className="review-list"
              id="review-filter-panel"
              role="tabpanel"
            >
              {visibleItems.length === 0 ? (
                <EmptyBlock title="No matching work">
                  Completed agent work will appear here as it happens.
                </EmptyBlock>
              ) : (
                visibleItems.map((item) => (
                  <button
                    aria-current={selected?.id === item.id}
                    className={selected?.id === item.id ? "selected" : ""}
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    type="button"
                  >
                    <span
                      className={`review-kind-mark ${item.kind} ${
                        item.kind === "ci" ? statusTone(item.status) : ""
                      }`.trim()}
                    >
                      {item.kind === "approvals"
                        ? "!"
                        : item.kind === "ci"
                          ? "✓"
                          : item.kind === "changes"
                            ? "±"
                            : "↗"}
                    </span>
                    <span className="review-list-copy">
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                      {item.timestamp ? (
                        <time dateTime={item.timestamp}>
                          {displayTimestamp(item.timestamp)}
                        </time>
                      ) : null}
                    </span>
                    <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="review-detail">
            {!selected ? (
              <EmptyBlock title="No review items yet">
                Decisions, changed files, and verification results appear here.
                Completed run history stays in the Runs tab.
              </EmptyBlock>
            ) : (
              <>
                <header className="review-detail-header">
                  <div>
                    <span>
                      {selected.kind === "approvals"
                        ? "decision required"
                        : selected.kind === "ci"
                          ? "verification"
                          : selected.kind === "changes"
                            ? "file changed"
                            : "agent work event"}
                    </span>
                    <h2>{selected.title}</h2>
                    <p>{selected.description}</p>
                  </div>
                  <Badge tone={statusTone(selected.status)}>
                    {selected.status}
                  </Badge>
                </header>

                {selected.kind === "approvals" ? (
                  <div className="review-decision">
                    <div className="review-command">
                      <span>Requested command</span>
                      <code>{asString(selected.raw.command)}</code>
                    </div>
                    <dl className="review-facts">
                      <div>
                        <dt>Reason</dt>
                        <dd>{asString(selected.raw.reason, "Not provided")}</dd>
                      </div>
                      <div>
                        <dt>Scope</dt>
                        <dd>
                          {asString(selected.raw.platform, "desktop")} ·{" "}
                          {asString(selected.raw.sessionKey, "local session")}
                        </dd>
                      </div>
                      <div>
                        <dt>Requested</dt>
                        <dd>
                          {displayTimestamp(asString(selected.raw.createdAt))}
                        </dd>
                      </div>
                      <div>
                        <dt>Expires</dt>
                        <dd>
                          {displayTimestamp(asString(selected.raw.expiresAt))}
                        </dd>
                      </div>
                    </dl>
                    {selected.status === "pending" ? (
                      <div className="review-actions">
                        <button
                          className="primary-button"
                          disabled={Boolean(busy)}
                          onClick={() => void decideApproval("approve")}
                          type="button"
                        >
                          {busy === "approve" ? "Approving…" : "Approve"}
                        </button>
                        <button
                          className="danger-button"
                          disabled={Boolean(busy)}
                          onClick={() => void decideApproval("deny")}
                          type="button"
                        >
                          {busy === "deny" ? "Denying…" : "Deny"}
                        </button>
                        <small>
                          Approval records permission only. It does not execute
                          a command from this screen.
                        </small>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selected.kind === "changes" ? (
                  <div className="review-patch">
                    <div className="review-detail-toolbar">
                      <span>{selected.path}</span>
                      <div>
                        <button
                          className="text-button"
                          onClick={() => {
                            window.location.hash = "/code";
                          }}
                          type="button"
                        >
                          Open workspace
                        </button>
                        <button
                          className="primary-button"
                          disabled={!patch.data?.patch?.patch}
                          onClick={() =>
                            onSendToChat({
                              text: [
                                `Review and improve the change in ${selected.path}.`,
                                `<review_context path="${selected.path}">`,
                                (patch.data?.patch?.patch ?? "").slice(
                                  0,
                                  12_000,
                                ),
                                "</review_context>",
                              ].join("\n"),
                              workspacePath,
                              projectScope,
                            })
                          }
                          type="button"
                        >
                          Ask Doolittle
                        </button>
                      </div>
                    </div>
                    <section
                      aria-label={`Review comments for ${selected.path}`}
                      className="review-feedback"
                    >
                      <header>
                        <span>
                          Review notes
                          <small>
                            {
                              selectedPathComments.filter(
                                (comment) => comment.status === "open",
                              ).length
                            }{" "}
                            open on this file
                          </small>
                        </span>
                        <div>
                          <button
                            className="text-button"
                            onClick={() =>
                              startComment(selected.path ?? "changed file")
                            }
                            type="button"
                          >
                            + File note
                          </button>
                          <button
                            className="primary-button"
                            disabled={openCommentCount === 0}
                            onClick={() => void sendReviewFeedback()}
                            type="button"
                          >
                            {openCommentCount > 0
                              ? `Send ${openCommentCount} to chat`
                              : "Send to chat"}
                          </button>
                        </div>
                      </header>

                      {selectedPathComments.length > 0 ? (
                        <ol className="review-comment-list">
                          {selectedPathComments.map((comment) => (
                            <li
                              className={
                                comment.status === "resolved" ? "resolved" : ""
                              }
                              key={comment.id}
                            >
                              <div className="review-comment-location">
                                <span>
                                  {comment.anchor
                                    ? `${comment.anchor.side === "new" ? "+" : "−"} line ${comment.anchor.line}`
                                    : "Whole file"}
                                </span>
                                <Badge
                                  tone={
                                    comment.status === "open"
                                      ? "warn"
                                      : "neutral"
                                  }
                                >
                                  {comment.status}
                                </Badge>
                              </div>
                              {comment.anchor?.preview ? (
                                <code>{comment.anchor.preview}</code>
                              ) : null}
                              <p>{comment.body}</p>
                              <div className="review-comment-actions">
                                <button
                                  onClick={() =>
                                    void toggleCommentResolved(comment.id)
                                  }
                                  type="button"
                                >
                                  {comment.status === "open"
                                    ? "Resolve"
                                    : "Reopen"}
                                </button>
                                <button
                                  onClick={() =>
                                    startComment(
                                      comment.path,
                                      comment.anchor,
                                      comment,
                                    )
                                  }
                                  type="button"
                                >
                                  Edit
                                </button>
                                <button
                                  aria-label={`Delete review note for ${comment.path}`}
                                  className="danger"
                                  onClick={() => void deleteComment(comment.id)}
                                  type="button"
                                >
                                  Delete
                                </button>
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="review-feedback-empty">
                          Add a file note or use the <strong>+</strong> control
                          beside a diff line. Drafts stay local to this
                          workspace and revision.
                        </p>
                      )}

                      {activeCommentTarget ? (
                        <div className="review-comment-editor">
                          <label htmlFor="review-comment-draft">
                            {editingCommentId
                              ? "Edit review note"
                              : activeCommentTarget.anchor
                                ? `Comment on ${activeCommentTarget.anchor.side === "new" ? "+" : "−"} line ${activeCommentTarget.anchor.line}`
                                : "Comment on this file"}
                          </label>
                          {activeCommentTarget.anchor?.preview ? (
                            <code>{activeCommentTarget.anchor.preview}</code>
                          ) : null}
                          <textarea
                            id="review-comment-draft"
                            maxLength={2_000}
                            onChange={(event) =>
                              setCommentDraft(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (
                                (event.metaKey || event.ctrlKey) &&
                                event.key === "Enter"
                              ) {
                                event.preventDefault();
                                void saveComment();
                              } else if (event.key === "Escape") {
                                cancelComment();
                              }
                            }}
                            placeholder="Describe the change you want the agent to make…"
                            ref={commentEditorRef}
                            rows={3}
                            value={commentDraft}
                          />
                          <div>
                            <small>
                              {commentDraft.length.toLocaleString()} / 2,000 ·{" "}
                              {window.doolittle.platform === "darwin"
                                ? "⌘ Enter"
                                : "Ctrl Enter"}{" "}
                              to save
                            </small>
                            <button
                              className="text-button"
                              onClick={cancelComment}
                              type="button"
                            >
                              Cancel
                            </button>
                            <button
                              className="primary-button"
                              disabled={!commentDraft.trim()}
                              onClick={() => void saveComment()}
                              type="button"
                            >
                              {editingCommentId ? "Save changes" : "Save note"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </section>
                    {patch.loading ? (
                      <LoadingBlock label="Preparing patch…" />
                    ) : patch.error ? (
                      <ErrorBlock error={patch.error} retry={patch.reload} />
                    ) : patch.data?.patch?.patch ? (
                      <pre>
                        <code>
                          {parseReviewPatchLines(patch.data.patch.patch).map(
                            (line) => (
                              <span
                                className={`review-patch-line ${line.kind}`}
                                key={line.key}
                              >
                                {line.anchor ? (
                                  <button
                                    aria-label={`Add review note on ${line.anchor.side === "new" ? "new" : "old"} line ${line.anchor.line}`}
                                    className={
                                      selectedPathComments.some(
                                        (comment) =>
                                          comment.anchor?.side ===
                                            line.anchor?.side &&
                                          comment.anchor?.line ===
                                            line.anchor?.line,
                                      )
                                        ? "has-comment"
                                        : ""
                                    }
                                    onClick={() =>
                                      startComment(
                                        selected.path ?? "changed file",
                                        line.anchor,
                                      )
                                    }
                                    title={`Comment on ${line.anchor.side === "new" ? "+" : "−"} line ${line.anchor.line}`}
                                    type="button"
                                  >
                                    +
                                  </button>
                                ) : (
                                  <i
                                    aria-hidden="true"
                                    className="review-patch-gutter"
                                  />
                                )}
                                {line.line || " "}
                              </span>
                            ),
                          )}
                        </code>
                      </pre>
                    ) : (
                      <EmptyBlock title="No textual patch">
                        This may be a new, binary, or metadata-only file.
                      </EmptyBlock>
                    )}
                  </div>
                ) : null}

                {selected.kind === "ci" ? (
                  <div className="review-ci-detail">
                    {asString(selected.raw.category) === "pull-request" ? (
                      <>
                        <div className="review-ci-hero">
                          <div>
                            <span>Pull request</span>
                            <strong>
                              {asString(selected.raw.headRefName, "branch")} →{" "}
                              {asString(selected.raw.baseRefName, "base")}
                            </strong>
                          </div>
                          <a
                            href={asString(selected.raw.url)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open on GitHub ↗
                          </a>
                        </div>
                        <dl className="review-facts">
                          <div>
                            <dt>Review</dt>
                            <dd>
                              {asString(
                                selected.raw.reviewDecision,
                                "No decision",
                              )
                                .toLowerCase()
                                .replaceAll("_", " ")}
                            </dd>
                          </div>
                          <div>
                            <dt>Merge state</dt>
                            <dd>
                              {asString(
                                selected.raw.mergeStateStatus,
                                "unknown",
                              ).toLowerCase()}
                            </dd>
                          </div>
                          <div>
                            <dt>Changes</dt>
                            <dd>
                              <span className="review-additions">
                                +{asNumber(selected.raw.additions)}
                              </span>{" "}
                              <span className="review-deletions">
                                −{asNumber(selected.raw.deletions)}
                              </span>{" "}
                              across {asNumber(selected.raw.changedFiles)} files
                            </dd>
                          </div>
                          <div>
                            <dt>Conversation</dt>
                            <dd>
                              {asNumber(selected.raw.comments)} comments ·{" "}
                              {asNumber(selected.raw.reviews)} reviews
                            </dd>
                          </div>
                        </dl>
                        <div className="review-ci-checks">
                          <div>
                            <span>Checks</span>
                            <small>{review?.checks.length ?? 0}</small>
                          </div>
                          {(review?.checks ?? []).length > 0 ? (
                            <ul>
                              {(review?.checks ?? []).map((check) => {
                                const checkStatus = checkDisplayStatus(check);
                                return (
                                  <li
                                    key={[
                                      check.name,
                                      check.workflow,
                                      check.url,
                                      check.startedAt,
                                      check.completedAt,
                                    ].join(":")}
                                  >
                                    <i
                                      className={statusTone(checkStatus)}
                                      aria-hidden="true"
                                    />
                                    <span>
                                      <strong>{check.name}</strong>
                                      <small>
                                        {check.workflow ?? "Pull request check"}
                                      </small>
                                    </span>
                                    <Badge tone={statusTone(checkStatus)}>
                                      {checkStatus}
                                    </Badge>
                                    {check.url ? (
                                      <a
                                        aria-label={`Open ${check.name} on GitHub`}
                                        href={check.url}
                                        rel="noreferrer"
                                        target="_blank"
                                      >
                                        ↗
                                      </a>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <EmptyBlock title="No checks reported">
                              GitHub has not reported checks for this pull
                              request.
                            </EmptyBlock>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="review-ci-hero">
                          <div>
                            <span>
                              {asString(selected.raw.category) === "check"
                                ? "Check"
                                : "Workflow run"}
                            </span>
                            <strong>{selected.title}</strong>
                          </div>
                          {asString(selected.raw.url) ? (
                            <a
                              href={asString(selected.raw.url)}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Open on GitHub ↗
                            </a>
                          ) : null}
                        </div>
                        <dl className="review-facts">
                          <div>
                            <dt>Status</dt>
                            <dd>{selected.status}</dd>
                          </div>
                          <div>
                            <dt>Workflow</dt>
                            <dd>
                              {asString(
                                selected.raw.workflow,
                                asString(selected.raw.event, "GitHub Actions"),
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>Branch</dt>
                            <dd>
                              {asString(
                                selected.raw.headBranch,
                                review?.branch ?? "current branch",
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>Updated</dt>
                            <dd>
                              {displayTimestamp(
                                asString(
                                  selected.raw.completedAt,
                                  asString(
                                    selected.raw.updatedAt,
                                    asString(selected.raw.startedAt),
                                  ),
                                ),
                              )}
                            </dd>
                          </div>
                        </dl>
                      </>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
