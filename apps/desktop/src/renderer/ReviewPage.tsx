import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RepositoryReviewResponse } from "../shared/contracts";
import type { ChatContextRequest } from "./chat-context-handoff";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { ResourceStatusBar } from "./components/ResourceStatusBar";
import type { ComputerOrigin } from "./computer-origin";
import {
  type ActionFeedback,
  asArray,
  asString,
  desktopRequest,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  PageHeader,
  useApiResource,
} from "./lib";
import { reviewRequests } from "./resource-request-policy";
import { REVIEW_WORKSPACE_CLASS, reviewPageClass } from "./review/layout";
import {
  type ApprovalResponse,
  type ChangesResponse,
  checkDisplayStatus,
  filterReviewItems,
  gitChanges,
  gitRecords,
  type PatchResponse,
  type RepositoryBranchesResponse,
  type RepositoryConflictsResponse,
  type RepositoryRemotesResponse,
  type RepositoryStashesResponse,
  type RepositoryWorktreesResponse,
  type ReviewFilter,
  type RunsResponse,
  reviewItems,
  statusTone,
} from "./review/models";
import { ReviewDetail } from "./review/ReviewDetail";
import { ReviewEvidence } from "./review/ReviewEvidence";
import { ReviewHeader, ReviewOverview } from "./review/ReviewOverview";
import { ReviewQueue } from "./review/ReviewQueue";
import {
  compileReviewFeedback,
  createReviewComment,
  loadReviewComments,
  mergeReviewComments,
  type ReviewComment,
  type ReviewCommentAnchor,
  type ReviewRecordResponse,
  reviewCommentIdentity,
  reviewRecordMatchesIdentity,
  saveReviewComments,
} from "./review-comments";
import { reviewWorkState } from "./review-work-state";
import { workspacePathsEqual } from "./workspace-path";

export function reviewWorkspaceScopeKey(
  workspacePath: string,
  projectScope: string,
  origin?: ComputerOrigin,
): string {
  return JSON.stringify([
    workspacePath,
    projectScope,
    origin?.botId ?? "",
    origin?.originConversationId ?? "",
    origin?.workspacePath ?? "",
  ]);
}

export function reviewPatchResourceDependencies(
  active: boolean,
  scopeKey: string,
  selectedId?: string,
  selectedPath?: string,
  staged = false,
): readonly unknown[] {
  return [active, scopeKey, selectedId ?? "", selectedPath ?? "", staged];
}

export function shouldShowReviewWorkspace(itemCount: number): boolean {
  return itemCount > 0;
}

export function ReviewPage({
  active,
  computerOrigin,
  contextScope,
  embedded = false,
  onOpenWorkspaceFile,
  onSendToChat,
  projectScope,
  workspacePath,
}: {
  active: boolean;
  computerOrigin?: ComputerOrigin;
  /** Optional immutable bot/conversation origin supplied by the owning host. */
  contextScope?: string;
  embedded?: boolean;
  onOpenWorkspaceFile?: (path: string) => void;
  onSendToChat: (request: ChatContextRequest) => void;
  projectScope: string;
  workspacePath: string;
}) {
  const scopeKey = reviewWorkspaceScopeKey(
    workspacePath,
    projectScope,
    computerOrigin,
  );
  const repositoryEnabled = Boolean(
    computerOrigin &&
      workspacePath &&
      workspacePathsEqual(
        computerOrigin.workspacePath,
        workspacePath,
        window.doolittle.platform,
      ),
  );
  function useReviewResource<T>(
    path: string | null,
    dependencies: readonly unknown[],
  ) {
    return useApiResource<T>(
      path,
      dependencies,
      computerOrigin?.botId,
      computerOrigin,
    );
  }
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const commentEditorRef = useRef<HTMLTextAreaElement>(null);
  const migratedRecordRef = useRef("");
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentTarget, setCommentTarget] = useState<{
    path: string;
    anchor?: ReviewCommentAnchor;
  } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [sourceControlOpen, setSourceControlOpen] = useState(false);
  const requestPolicy = reviewRequests({
    active,
    evidenceOpen,
    sourceControlOpen,
  });

  const approvals = useReviewResource<ApprovalResponse>(
    requestPolicy.primary ? "/execution/approvals" : null,
    [requestPolicy.primary, scopeKey],
  );
  const changes = useReviewResource<ChangesResponse>(
    requestPolicy.primary && repositoryEnabled ? "/repo/changes" : null,
    [requestPolicy.primary, scopeKey],
  );
  const branches = useReviewResource<RepositoryBranchesResponse>(
    requestPolicy.sourceControl && repositoryEnabled ? "/repo/branches" : null,
    [requestPolicy.sourceControl, scopeKey],
  );
  const remotes = useReviewResource<RepositoryRemotesResponse>(
    requestPolicy.sourceControl && repositoryEnabled ? "/repo/remotes" : null,
    [requestPolicy.sourceControl, scopeKey],
  );
  const stashes = useReviewResource<RepositoryStashesResponse>(
    requestPolicy.sourceControl && repositoryEnabled ? "/repo/stashes" : null,
    [requestPolicy.sourceControl, scopeKey],
  );
  const conflicts = useReviewResource<RepositoryConflictsResponse>(
    requestPolicy.sourceControl && repositoryEnabled ? "/repo/conflicts" : null,
    [requestPolicy.sourceControl, scopeKey],
  );
  const worktrees = useReviewResource<RepositoryWorktreesResponse>(
    requestPolicy.sourceControl && repositoryEnabled ? "/repo/worktrees" : null,
    [requestPolicy.sourceControl, scopeKey],
  );
  const runs = useReviewResource<RunsResponse>(
    requestPolicy.primary ? "/codegen/runs" : null,
    [requestPolicy.primary, scopeKey],
  );
  const repositoryReview = useReviewResource<RepositoryReviewResponse>(
    requestPolicy.primary && repositoryEnabled ? "/repo/review" : null,
    [requestPolicy.primary, scopeKey],
  );
  const branchRecord = useReviewResource<ReviewRecordResponse>(
    requestPolicy.primary && repositoryEnabled
      ? "/review-record?limit=80"
      : null,
    [requestPolicy.primary, scopeKey],
  );
  const review = repositoryReview.data?.review;
  const originBotId = computerOrigin?.botId;
  const originConversationId = computerOrigin?.originConversationId;
  const commentIdentity = useMemo(() => {
    const identity = reviewCommentIdentity(review);
    return originBotId && originConversationId
      ? {
          ...identity,
          storageKey: `${identity.storageKey}:${encodeURIComponent(originBotId)}:${encodeURIComponent(originConversationId)}`,
        }
      : identity;
  }, [review, originBotId, originConversationId]);
  const reviewContextScope = JSON.stringify([
    contextScope ?? "",
    scopeKey,
    commentIdentity.storageKey,
  ]);
  const items = useMemo(
    () => reviewItems(approvals.data, changes.data, review),
    [approvals.data, changes.data, review],
  );
  const visibleItems = useMemo(
    () => filterReviewItems(items, filter, query),
    [filter, items, query],
  );
  const selected =
    visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0];
  const activeCommentTarget =
    commentTarget?.path === selected?.path ? commentTarget : null;
  const patch = useReviewResource<PatchResponse>(
    active && repositoryEnabled && selected?.kind === "changes" && selected.path
      ? `/repo/patch?path=${encodeURIComponent(selected.path)}&staged=${
          selected.status === "staged"
        }`
      : null,
    reviewPatchResourceDependencies(
      active,
      scopeKey,
      selected?.id,
      selected?.path,
      selected?.status === "staged",
    ),
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
    setComments(
      repositoryEnabled
        ? loadReviewComments(commentIdentity, window.localStorage)
        : [],
    );
    setCommentTarget(null);
    setCommentDraft("");
    setEditingCommentId("");
  }, [commentIdentity, repositoryEnabled]);

  useEffect(() => {
    const record = branchRecord.data?.record;
    if (
      !active ||
      !repositoryEnabled ||
      !record ||
      !reviewRecordMatchesIdentity(commentIdentity, record.scope)
    ) {
      return;
    }
    const local = loadReviewComments(commentIdentity, window.localStorage);
    const merged = mergeReviewComments(local, record.comments);
    setComments(merged);
    saveReviewComments(commentIdentity, merged, window.localStorage);
  }, [active, branchRecord.data, commentIdentity, repositoryEnabled]);

  useEffect(() => {
    const migrationKey = commentIdentity.storageKey;
    if (
      !active ||
      !repositoryEnabled ||
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
      undefined,
      undefined,
      computerOrigin?.botId,
      computerOrigin,
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
      .catch((error) => {
        if (cancelled) return;
        setFeedback({
          tone: "warn",
          message: `Durable review notes are unavailable: ${errorMessage(error)}. Local notes remain in this app.`,
        });
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
    computerOrigin,
    repositoryEnabled,
  ]);

  const reload = () => {
    if (!active) return;
    approvals.reload();
    changes.reload();
    runs.reload();
    repositoryReview.reload();
    branchRecord.reload();
    if (requestPolicy.sourceControl) {
      branches.reload();
      remotes.reload();
      stashes.reload();
      conflicts.reload();
      worktrees.reload();
    }
    if (selected?.kind === "changes") patch.reload();
  };

  const persistComments = (nextComments: ReviewComment[]) => {
    setComments(nextComments);
    return saveReviewComments(
      commentIdentity,
      nextComments,
      window.localStorage,
    );
  };

  const applyDurableRecord = (response: ReviewRecordResponse) => {
    persistComments(response.record.comments);
    branchRecord.reload();
  };

  const showOfflineFallback = (error: unknown, locallyPersisted: boolean) => {
    setFeedback({
      tone: "warn",
      message: locallyPersisted
        ? `Saved only in this app; durable review notes are unavailable: ${errorMessage(error)}`
        : `Durable review notes are unavailable and local storage could not save this note. It exists only in this window and will be lost on reload: ${errorMessage(error)}`,
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
    if (!active || !repositoryEnabled || !commentTarget || !commentDraft.trim())
      return;
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
      const locallyPersisted = persistComments(nextComments);
      try {
        applyDurableRecord(
          await desktopRequest<ReviewRecordResponse>(
            `/review-record/comments/${encodeURIComponent(editingCommentId)}`,
            "PATCH",
            { body: commentDraft.trim() },
            undefined,
            undefined,
            computerOrigin?.botId,
            computerOrigin,
          ),
        );
      } catch (error) {
        showOfflineFallback(error, locallyPersisted);
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
      const locallyPersisted = persistComments([...comments, comment]);
      try {
        applyDurableRecord(
          await desktopRequest<ReviewRecordResponse>(
            "/review-record/comments",
            "POST",
            { comment },
            undefined,
            undefined,
            computerOrigin?.botId,
            computerOrigin,
          ),
        );
      } catch (error) {
        showOfflineFallback(error, locallyPersisted);
      }
    }
    cancelComment();
  };

  const toggleCommentResolved = async (commentId: string) => {
    if (!active || !repositoryEnabled) return;
    const now = new Date().toISOString();
    const selectedComment = comments.find(
      (comment) => comment.id === commentId,
    );
    const nextStatus = selectedComment?.status === "open" ? "resolved" : "open";
    const locallyPersisted = persistComments(
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
          undefined,
          undefined,
          undefined,
          computerOrigin?.botId,
          computerOrigin,
        ),
      );
    } catch (error) {
      showOfflineFallback(error, locallyPersisted);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!active || !repositoryEnabled) return;
    try {
      applyDurableRecord(
        await desktopRequest<ReviewRecordResponse>(
          `/review-record/comments/${encodeURIComponent(commentId)}`,
          "DELETE",
          undefined,
          undefined,
          undefined,
          computerOrigin?.botId,
          computerOrigin,
        ),
      );
      if (editingCommentId === commentId) cancelComment();
    } catch (error) {
      setFeedback({
        tone: "warn",
        message: `Could not delete the review note; it was kept. Retry when the local runtime returns: ${errorMessage(error)}`,
      });
    }
  };

  const sendReviewFeedback = async () => {
    if (!active || !repositoryEnabled || openCommentCount === 0) return;
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
          undefined,
          undefined,
          undefined,
          computerOrigin?.botId,
          computerOrigin,
        ),
      );
    } catch (error) {
      setFeedback({
        tone: "warn",
        message: `Review feedback could not be recorded until the local runtime returns: ${errorMessage(error)}`,
      });
    }
  };

  const decideApproval = async (decision: "approve" | "deny") => {
    if (!active || selected?.kind !== "approvals") return;
    const approvalId = asString(selected.raw.id);
    if (!approvalId) return;
    setBusy(decision);
    setFeedback(null);
    try {
      await desktopRequest(
        `/execution/approvals/${encodeURIComponent(approvalId)}/${decision}`,
        "POST",
        {},
        undefined,
        undefined,
        computerOrigin?.botId,
        computerOrigin,
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
  const statusResources = [
    { label: "approvals", resource: approvals },
    { label: "changes", resource: changes },
    { label: "agent runs", resource: runs },
    { label: "review checks", resource: repositoryReview },
    { label: "review record", resource: branchRecord, required: false },
    { label: "source control", resource: branches, required: false },
    { label: "remotes", resource: remotes, required: false },
    { label: "stashes", resource: stashes, required: false },
    { label: "conflicts", resource: conflicts, required: false },
    { label: "worktrees", resource: worktrees, required: false },
  ].filter((entry) => entry.resource.status !== "disabled");
  const blockingError =
    items.length === 0 && sourceErrors.length === 4
      ? (sourceErrors[0] ?? "")
      : "";
  if (!active) {
    return (
      <div
        className={reviewPageClass(embedded)}
        data-project-scope={projectScope}
        data-workspace-path={workspacePath}
      >
        {!embedded ? (
          <PageHeader
            actions={
              <button
                className="secondary-button"
                disabled
                onClick={reload}
                type="button"
              >
                Refresh
              </button>
            }
            description="Inspect outcomes, changes, checks, and decisions."
            eyebrow="Tasks"
            title="Review"
          />
        ) : null}
        <OfflineRouteState>
          Review evidence and approval actions are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      </div>
    );
  }
  return (
    <div
      className={reviewPageClass(embedded)}
      data-project-scope={projectScope}
      data-workspace-path={workspacePath}
    >
      <ReviewHeader
        active={active}
        embedded={embedded}
        itemCount={items.length}
        onRefresh={reload}
        pendingCount={pendingCount}
      />
      <ResourceStatusBar resources={statusResources} />
      {branchRecord.error ? (
        <Notice tone="warn">
          Durable review notes are unavailable: {branchRecord.error}
        </Notice>
      ) : null}
      {!repositoryEnabled ? (
        <Notice tone="warn">
          Repository review is unavailable until this project has a confirmed
          chat and workspace origin.
        </Notice>
      ) : null}
      <ReviewOverview
        agentRunCount={agentRunCount}
        branchScope={branchScope}
        changedFileCount={changedFileCount}
        checksPassing={checkSummary.passing}
        empty={workState.tone === "neutral"}
        openCommentCount={openCommentCount}
        reviewBranch={review?.local.branch ?? review?.branch}
        reviewHead={review?.local.head}
        workState={workState}
      />
      <ReviewEvidence
        active={active}
        agentRunCount={agentRunCount}
        branchEvents={branchEvents}
        branchRecordError={branchRecord.error}
        branchScope={branchScope}
        branches={gitRecords<RepositoryBranch>(branches.data?.branches)}
        changedFileCount={changedFileCount}
        changes={gitChanges(changes.data)}
        checkSummary={checkSummary}
        conflicts={gitRecords<RepositoryConflict>(conflicts.data?.conflicts)}
        evidenceOpen={evidenceOpen}
        onEvidenceOpenChange={(open) => {
          setEvidenceOpen(open);
          if (!open) setSourceControlOpen(false);
        }}
        onRefresh={reload}
        onSourceControlOpenChange={setSourceControlOpen}
        openCommentCount={openCommentCount}
        pendingCount={pendingCount}
        remotes={gitRecords<RepositoryRemote>(remotes.data?.remotes)}
        repositoryReviewError={repositoryReview.error}
        review={review}
        stashes={gitRecords<RepositoryStash>(stashes.data?.stashes)}
        sourceControlErrorCount={
          [
            branches.error,
            remotes.error,
            stashes.error,
            conflicts.error,
            worktrees.error,
          ].filter(Boolean).length
        }
        sourceControlLoading={
          branches.loading ||
          remotes.loading ||
          stashes.loading ||
          conflicts.loading ||
          worktrees.loading
        }
        sourceControlOpen={sourceControlOpen}
        worktrees={gitRecords<{
          path: string;
          branch?: string;
          current?: boolean;
          prunable?: boolean;
        }>(worktrees.data?.worktrees)}
      />

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
      ) : !shouldShowReviewWorkspace(items.length) ? null : (
        <div className={REVIEW_WORKSPACE_CLASS}>
          <ReviewQueue
            contextScope={reviewContextScope}
            filter={filter}
            items={items}
            onFilterChange={setFilter}
            onQueryChange={setQuery}
            onSelect={setSelectedId}
            platform={window.doolittle.platform}
            query={query}
            searchRef={searchRef}
            selectedId={selected?.id ?? ""}
            visibleItems={visibleItems}
          />
          <ReviewDetail
            contextScope={reviewContextScope}
            activeCommentTarget={activeCommentTarget}
            busy={busy}
            commentDraft={commentDraft}
            commentEditorRef={commentEditorRef}
            editingCommentId={editingCommentId}
            onAskDoolittle={() => {
              if (!selected?.path) return;
              onSendToChat({
                text: [
                  `Review and improve the change in ${selected.path}.`,
                  `<review_context path="${selected.path}">`,
                  (patch.data?.patch?.patch ?? "").slice(0, 12_000),
                  "</review_context>",
                ].join("\n"),
                workspacePath,
                projectScope,
              });
            }}
            onCancelComment={cancelComment}
            onDecision={(decision) => void decideApproval(decision)}
            onDelete={(commentId) => void deleteComment(commentId)}
            onDraftChange={setCommentDraft}
            onOpenWorkspace={() => {
              if (selected?.path) {
                onOpenWorkspaceFile?.(selected.path);
              }
            }}
            onSaveComment={() => void saveComment()}
            onSendFeedback={() => void sendReviewFeedback()}
            onStartComment={startComment}
            onToggleResolved={(commentId) =>
              void toggleCommentResolved(commentId)
            }
            openCommentCount={openCommentCount}
            patch={patch}
            platform={window.doolittle.platform}
            review={review}
            selected={selected}
            selectedPathComments={selectedPathComments}
          />
        </div>
      )}
    </div>
  );
}
