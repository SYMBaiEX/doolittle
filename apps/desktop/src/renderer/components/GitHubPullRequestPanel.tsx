import type {
  RepositoryMutationRequest,
  RepositoryMutationResult,
} from "@doolittle/contracts/repository";
import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { Textarea } from "@elizaos/ui/components/ui/textarea";
import { ExternalLink } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { RepositoryReview } from "../../shared/contracts";
import { errorMessage, Notice } from "../lib";
import {
  type GitNotice,
  mutationNotice,
  requestLabel,
} from "../repository-control";
import { UiIcon } from "./UiIcon";

const FORM_CLASS = "grid gap-[9px]";
const LABEL_CLASS =
  "grid gap-[5px] text-[11px] font-bold text-[var(--text-soft)]";
const OPTIONAL_CLASS =
  "font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]";
const CHECKBOX_CLASS =
  "flex min-h-[31px] items-center gap-[7px] text-[10px] font-bold text-[var(--muted)] [&_input]:accent-[var(--accent)]";
const ACTIONS_CLASS =
  "flex items-center justify-end gap-2.5 max-[760px]:flex-col max-[760px]:items-start [&_button]:whitespace-nowrap";
const SELECT_CLASS =
  "w-full resize-y rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface)] px-2 py-[7px] font-[var(--font-sans)] text-xs text-[var(--text)] focus:border-[var(--border)] focus:ring-0 focus:outline-none";

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
    <section
      aria-label="GitHub pull request"
      className="grid shrink-0 gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-raised)_90%,transparent)] p-3 shadow-[inset_2px_0_var(--accent)]"
    >
      <header className="flex items-center justify-between gap-2.5 max-[760px]:flex-col max-[760px]:items-start">
        <div className="grid min-w-0 gap-[3px]">
          <span className="eyebrow">GitHub pull request</span>
          <strong className="overflow-hidden text-[13px] text-ellipsis whitespace-nowrap text-[var(--text)]">
            {pullRequest
              ? `#${pullRequest.number} ${pullRequest.title}`
              : "Open a pull request"}
          </strong>
          <small className="font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
            {review.repository?.slug ?? "GitHub unavailable"} ·{" "}
            {prStateLabel(review)}
          </small>
        </div>
        {pullRequest?.url ? (
          <a
            className="inline-flex shrink-0 items-center gap-1 font-[var(--font-mono)] text-[10px] font-bold text-[var(--accent)] uppercase no-underline hover:underline hover:underline-offset-3"
            href={pullRequest.url}
            rel="noreferrer"
            target="_blank"
          >
            View on GitHub
            <UiIcon icon={ExternalLink} size="xs" />
          </a>
        ) : null}
      </header>

      {!manageable ? (
        <Notice tone="warn">
          {review.degraded?.detail ??
            "Connect GitHub CLI authentication and a GitHub remote to manage pull requests here."}
        </Notice>
      ) : !pullRequest ? (
        <form className={FORM_CLASS} onSubmit={createPullRequest}>
          <label className={LABEL_CLASS} htmlFor="github-pr-create-title">
            Title
            <Input
              density="compact"
              disabled={busy}
              id="github-pr-create-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Describe this change"
              value={title}
            />
          </label>
          <div className="grid grid-cols-[minmax(140px,0.35fr)_1fr] items-end gap-2.5 max-[760px]:grid-cols-1">
            <label className={LABEL_CLASS} htmlFor="github-pr-create-base">
              Base branch <span className={OPTIONAL_CLASS}>optional</span>
              <Input
                density="compact"
                disabled={busy}
                id="github-pr-create-base"
                onChange={(event) => setBase(event.target.value)}
                placeholder="main"
                value={base}
              />
            </label>
            <label className={CHECKBOX_CLASS}>
              <input
                checked={draft}
                disabled={busy}
                onChange={(event) => setDraft(event.target.checked)}
                type="checkbox"
              />
              Create as draft
            </label>
          </div>
          <label className={LABEL_CLASS} htmlFor="github-pr-create-body">
            Description <span className={OPTIONAL_CLASS}>optional</span>
            <Textarea
              density="compact"
              disabled={busy}
              id="github-pr-create-body"
              onChange={(event) => setBody(event.target.value)}
              placeholder="What changed, why, and how it was tested."
              rows={3}
              value={body}
            />
          </label>
          <div className={ACTIONS_CLASS}>
            <Button disabled={busy} type="submit">
              {busy ? "Creating…" : "Create pull request"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-2.5">
          {pullRequest.state === "open" ? (
            <>
              <div className="flex items-center justify-start gap-2.5 [&>button]:whitespace-nowrap">
                {pullRequest.isDraft ? (
                  <Button
                    disabled={busy}
                    onClick={() => void run({ type: "pr-ready" })}
                    type="button"
                    variant="secondary"
                  >
                    Mark ready for review
                  </Button>
                ) : null}
                <details className="min-w-0 open:grid open:w-[min(100%,560px)] open:gap-[9px]">
                  <summary className="cursor-pointer font-[var(--font-mono)] text-[10px] font-bold text-[var(--muted)] uppercase">
                    Edit pull request
                  </summary>
                  <form className={FORM_CLASS} onSubmit={updatePullRequest}>
                    <label
                      className={LABEL_CLASS}
                      htmlFor="github-pr-edit-title"
                    >
                      Title
                      <Input
                        density="compact"
                        disabled={busy}
                        id="github-pr-edit-title"
                        onChange={(event) => setTitle(event.target.value)}
                        value={title}
                      />
                    </label>
                    <label
                      className={LABEL_CLASS}
                      htmlFor="github-pr-edit-base"
                    >
                      Base branch{" "}
                      <span className={OPTIONAL_CLASS}>optional</span>
                      <Input
                        density="compact"
                        disabled={busy}
                        id="github-pr-edit-base"
                        onChange={(event) => setBase(event.target.value)}
                        value={base}
                      />
                    </label>
                    <label
                      className={LABEL_CLASS}
                      htmlFor="github-pr-edit-body"
                    >
                      Append or replace description{" "}
                      <span className={OPTIONAL_CLASS}>optional</span>
                      <Textarea
                        density="compact"
                        disabled={busy}
                        id="github-pr-edit-body"
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="Leave empty to keep the existing description."
                        rows={3}
                        value={body}
                      />
                    </label>
                    <Button disabled={busy} type="submit" variant="secondary">
                      Save pull request
                    </Button>
                  </form>
                </details>
              </div>

              <form
                className={`${FORM_CLASS} border-t border-[var(--border)] pt-2.5`}
              >
                <label className={LABEL_CLASS} htmlFor="github-pr-review-body">
                  Review feedback
                  <Textarea
                    density="compact"
                    disabled={busy}
                    id="github-pr-review-body"
                    onChange={(event) => setReviewBody(event.target.value)}
                    placeholder="Leave a concise review for this pull request."
                    rows={2}
                    value={reviewBody}
                  />
                </label>
                <div className={ACTIONS_CLASS}>
                  <Button
                    disabled={busy}
                    onClick={(event) => void submitReview(event, "comment")}
                    type="button"
                    variant="secondary"
                  >
                    Comment
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={(event) => void submitReview(event, "approve")}
                    type="button"
                    variant="secondary"
                  >
                    Approve
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={(event) =>
                      void submitReview(event, "request-changes")
                    }
                    type="button"
                    variant="destructive"
                  >
                    Request changes
                  </Button>
                </div>
              </form>

              <div className="flex flex-wrap items-center justify-start gap-2.5 border-t border-[var(--border)] pt-2.5">
                <label className={`${LABEL_CLASS} min-w-[175px]`}>
                  Merge method
                  <select
                    className={SELECT_CLASS}
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
                <label className={CHECKBOX_CLASS}>
                  <input
                    checked={deleteBranch}
                    disabled={busy}
                    onChange={(event) => setDeleteBranch(event.target.checked)}
                    type="checkbox"
                  />
                  Delete branch after merge
                </label>
                <div className={ACTIONS_CLASS}>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run({
                        type: "pr-close",
                        deleteBranch,
                      })
                    }
                    type="button"
                    variant="destructive"
                  >
                    Close pull request
                  </Button>
                  <Button
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
                  </Button>
                </div>
              </div>
            </>
          ) : pullRequest.state === "closed" ? (
            <div className={ACTIONS_CLASS}>
              <Button
                disabled={busy}
                onClick={() => void run({ type: "pr-reopen" })}
                type="button"
                variant="secondary"
              >
                Reopen pull request
              </Button>
            </div>
          ) : (
            <p className="m-0 text-xs text-[var(--muted)]">
              This pull request has been merged.
            </p>
          )}
        </div>
      )}

      {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}
    </section>
  );
}
