import type {
  RepositoryMutationRequest,
  RepositoryMutationResult,
} from "@doolittle/contracts/repository";
import { type FormEvent, useEffect, useState } from "react";
import type { RepositoryReview } from "../../shared/contracts";
import { errorMessage, Notice } from "../lib";
import {
  type GitNotice,
  mutationNotice,
  requestLabel,
} from "../repository-control";
import "./github-pull-request-panel.css";

type DesktopMutationResult =
  | { status: "cancelled" }
  | { status: "completed"; result: RepositoryMutationResult }
  | RepositoryMutationResult;

export type GitHubPullRequestPanelProps = {
  active: boolean;
  review?: RepositoryReview;
  onRefresh: () => void;
  mutate?: (
    request: RepositoryMutationRequest,
  ) => Promise<DesktopMutationResult>;
};

export function pullRequestMutationNotice(
  response: DesktopMutationResult,
): GitNotice {
  if ("status" in response) {
    if (response.status === "cancelled") {
      return { tone: "neutral", message: "Pull request operation cancelled." };
    }
    return mutationNotice(response.result);
  }
  return mutationNotice(response);
}

export function canManagePullRequest(review?: RepositoryReview): boolean {
  return Boolean(
    review?.local.isRepository &&
      review.repository?.host === "github.com" &&
      (review.state === "ready" ||
        review.degraded?.reason === "no_pull_request"),
  );
}

function prStateLabel(review: RepositoryReview): string {
  const pullRequest = review.pullRequest;
  if (!pullRequest) return "No pull request";
  if (pullRequest.state === "merged") return "Merged";
  if (pullRequest.state === "closed") return "Closed";
  if (pullRequest.isDraft) return "Draft";
  return "Open";
}

export function GitHubPullRequestPanel({
  active,
  review,
  onRefresh,
  mutate,
}: GitHubPullRequestPanelProps) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<GitNotice | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("");
  const [draft, setDraft] = useState(false);
  const [reviewBody, setReviewBody] = useState("");
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">(
    "squash",
  );
  const [deleteBranch, setDeleteBranch] = useState(true);
  const pullRequest = review?.pullRequest;
  const manageable = canManagePullRequest(review);

  useEffect(() => {
    setTitle(pullRequest?.title ?? "");
    setBody("");
    setBase(pullRequest?.baseRefName ?? "");
    setDraft(Boolean(!pullRequest));
    setReviewBody("");
    setNotice(null);
  }, [pullRequest]);

  const run = async (request: RepositoryMutationRequest): Promise<boolean> => {
    if (!active || !manageable || busy) return false;
    const runMutation = mutate ?? window.doolittle.mutateRepository;
    setBusy(true);
    setNotice({ tone: "neutral", message: requestLabel(request) });
    try {
      const result = await runMutation(request);
      const nextNotice = pullRequestMutationNotice(result);
      setNotice(nextNotice);
      if (nextNotice.tone === "good") onRefresh();
      return nextNotice.tone === "good";
    } catch (cause) {
      setNotice({ tone: "bad", message: errorMessage(cause) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createPullRequest = async (event: FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setNotice({ tone: "bad", message: "A pull request title is required." });
      return;
    }
    if (
      await run({
        type: "pr-create",
        title: nextTitle,
        body: body.trim() || undefined,
        base: base.trim() || undefined,
        draft,
      })
    ) {
      setBody("");
    }
  };

  const updatePullRequest = async (event: FormEvent) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setNotice({ tone: "bad", message: "A pull request title is required." });
      return;
    }
    await run({
      type: "pr-update",
      title: nextTitle,
      body: body.trim() || undefined,
      base: base.trim() || undefined,
    });
  };

  const submitReview = async (
    event: FormEvent,
    reviewEvent: "approve" | "request-changes" | "comment",
  ) => {
    event.preventDefault();
    const nextBody = reviewBody.trim();
    if (reviewEvent !== "approve" && !nextBody) {
      setNotice({
        tone: "bad",
        message: "Add review feedback before submitting.",
      });
      return;
    }
    if (
      await run({
        type: "pr-review",
        event: reviewEvent,
        body: nextBody || undefined,
      })
    ) {
      setReviewBody("");
    }
  };

  if (!review?.local.isRepository) return null;

  return (
    <section aria-label="GitHub pull request" className="github-pr-panel">
      <header className="github-pr-panel-header">
        <div>
          <span className="eyebrow">GitHub pull request</span>
          <strong>
            {pullRequest
              ? `#${pullRequest.number} ${pullRequest.title}`
              : "Open a pull request"}
          </strong>
          <small>
            {review.repository?.slug ?? "GitHub unavailable"} ·{" "}
            {prStateLabel(review)}
          </small>
        </div>
        {pullRequest?.url ? (
          <a href={pullRequest.url} rel="noreferrer" target="_blank">
            View on GitHub ↗
          </a>
        ) : null}
      </header>

      {!manageable ? (
        <Notice tone="warn">
          {review.degraded?.detail ??
            "Connect GitHub CLI authentication and a GitHub remote to manage pull requests here."}
        </Notice>
      ) : !pullRequest ? (
        <form className="github-pr-form" onSubmit={createPullRequest}>
          <label>
            Title
            <input
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Describe this change"
              value={title}
            />
          </label>
          <div className="github-pr-form-row">
            <label>
              Base branch <span>optional</span>
              <input
                disabled={busy}
                onChange={(event) => setBase(event.target.value)}
                placeholder="main"
                value={base}
              />
            </label>
            <label className="github-pr-checkbox">
              <input
                checked={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.checked)}
                type="checkbox"
              />
              Create as draft
            </label>
          </div>
          <label>
            Description <span>optional</span>
            <textarea
              disabled={busy}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What changed, why, and how it was tested."
              rows={3}
              value={body}
            />
          </label>
          <div className="github-pr-actions">
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "Creating…" : "Create pull request"}
            </button>
          </div>
        </form>
      ) : (
        <div className="github-pr-existing">
          {pullRequest.state === "open" ? (
            <>
              <div className="github-pr-quick-actions">
                {pullRequest.isDraft ? (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void run({ type: "pr-ready" })}
                    type="button"
                  >
                    Mark ready for review
                  </button>
                ) : null}
                <details>
                  <summary>Edit pull request</summary>
                  <form className="github-pr-form" onSubmit={updatePullRequest}>
                    <label>
                      Title
                      <input
                        disabled={busy}
                        onChange={(event) => setTitle(event.target.value)}
                        value={title}
                      />
                    </label>
                    <label>
                      Base branch <span>optional</span>
                      <input
                        disabled={busy}
                        onChange={(event) => setBase(event.target.value)}
                        value={base}
                      />
                    </label>
                    <label>
                      Append or replace description <span>optional</span>
                      <textarea
                        disabled={busy}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="Leave empty to keep the existing description."
                        rows={3}
                        value={body}
                      />
                    </label>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      type="submit"
                    >
                      Save pull request
                    </button>
                  </form>
                </details>
              </div>

              <form className="github-pr-review-form">
                <label>
                  Review feedback
                  <textarea
                    disabled={busy}
                    onChange={(event) => setReviewBody(event.target.value)}
                    placeholder="Leave a concise review for this pull request."
                    rows={2}
                    value={reviewBody}
                  />
                </label>
                <div className="github-pr-actions">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={(event) => void submitReview(event, "comment")}
                    type="button"
                  >
                    Comment
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={(event) => void submitReview(event, "approve")}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={(event) =>
                      void submitReview(event, "request-changes")
                    }
                    type="button"
                  >
                    Request changes
                  </button>
                </div>
              </form>

              <div className="github-pr-resolution">
                <label>
                  Merge method
                  <select
                    disabled={busy}
                    onChange={(event) =>
                      setMergeMethod(event.target.value as typeof mergeMethod)
                    }
                    value={mergeMethod}
                  >
                    <option value="squash">Squash and merge</option>
                    <option value="merge">Create a merge commit</option>
                    <option value="rebase">Rebase and merge</option>
                  </select>
                </label>
                <label className="github-pr-checkbox">
                  <input
                    checked={deleteBranch}
                    disabled={busy}
                    onChange={(event) => setDeleteBranch(event.target.checked)}
                    type="checkbox"
                  />
                  Delete branch after merge
                </label>
                <div className="github-pr-actions">
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() =>
                      void run({
                        type: "pr-close",
                        deleteBranch,
                      })
                    }
                    type="button"
                  >
                    Close pull request
                  </button>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      void run({
                        type: "pr-merge",
                        method: mergeMethod,
                        deleteBranch,
                      })
                    }
                    type="button"
                  >
                    Merge pull request
                  </button>
                </div>
              </div>
            </>
          ) : pullRequest.state === "closed" ? (
            <div className="github-pr-actions">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void run({ type: "pr-reopen" })}
                type="button"
              >
                Reopen pull request
              </button>
            </div>
          ) : (
            <p className="github-pr-complete">
              This pull request has been merged.
            </p>
          )}
        </div>
      )}

      {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}
    </section>
  );
}
