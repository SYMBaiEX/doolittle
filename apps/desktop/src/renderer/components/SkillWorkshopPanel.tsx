import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { Textarea } from "@elizaos/ui/components/ui/textarea";
import { type FormEvent, lazy, Suspense, useMemo, useState } from "react";
import {
  asArray,
  asString,
  desktopRequest,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  useApiResource,
} from "../lib";
import { CompactStatStrip } from "./CompactStatStrip";
import { OfflineRouteState } from "./OfflineRouteState";
import {
  SKILL_FILTER_CLASS,
  SKILL_FILTER_SELECTED_CLASS,
  SKILL_WORKSHOP_CLASS,
  SKILL_WORKSHOP_CREATE_CLASS,
  SKILL_WORKSHOP_GRID_CLASS,
  SKILL_WORKSHOP_PREVIEW_CLASS,
  SKILL_WORKSHOP_SUMMARY_CLASS,
} from "./skill-workshop-layout";
import {
  normalizeProposal,
  type SkillProposalFilter,
  skillWorkshopLabelCounts,
} from "./skill-workshop-model";

const SkillProposalCard = lazy(() => import("./SkillProposalCard"));

interface SkillProposalResponse {
  proposals?: unknown[];
}

interface SkillProposalDetailResponse {
  proposal?: unknown;
}

export function SkillWorkshopPanel({ active }: { active: boolean }) {
  const proposals = useApiResource<SkillProposalResponse>(
    active ? "/skills/proposals" : null,
    [active],
  );
  const [filter, setFilter] = useState<SkillProposalFilter>("pending");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [feedbackByProposal, setFeedbackByProposal] = useState<
    Record<string, string>
  >({});
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [creatingMessage, setCreatingMessage] = useState("");
  const [creatingError, setCreatingError] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [mutationError, setMutationError] = useState("");
  const normalizedEntries = useMemo(
    () =>
      asArray(proposals.data?.proposals).map((entry, index) =>
        normalizeProposal(entry, index),
      ),
    [proposals.data],
  );
  const proposalById = useMemo(
    () =>
      Object.fromEntries(normalizedEntries.map((entry) => [entry.id, entry])),
    [normalizedEntries],
  );

  const selectedProposal = proposalById[selectedId];
  const selectedDetail = useApiResource<SkillProposalDetailResponse>(
    active && selectedId
      ? `/skills/proposals/${encodeURIComponent(selectedId)}`
      : null,
    [active, selectedId, selectedProposal],
  );

  const selectedDetailPayload =
    selectedDetail.data?.proposal ?? selectedDetail.data;
  const normalizedDetail = selectedDetailPayload
    ? normalizeProposal(selectedDetailPayload, 0)
    : selectedProposal;

  const filtered = normalizedEntries.filter((entry) => {
    const normalizedQuery = query.trim().toLowerCase();
    const statusMatch =
      filter === "all" ||
      (filter === "pending" && entry.status === "pending") ||
      (filter === "approved" && entry.status === "approved") ||
      (filter === "rejected" &&
        (entry.status === "rejected" || entry.status === "blocked"));

    return (
      statusMatch &&
      (!normalizedQuery ||
        [entry.slug, entry.author, entry.reason, entry.safety.reason]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery))
    );
  });
  const counts = skillWorkshopLabelCounts(normalizedEntries);

  const submitProposal = async (event: FormEvent) => {
    event.preventDefault();
    if (!active) return;
    const trimmedSlug = slug.trim();
    const trimmedContent = content.trim();

    if (!trimmedSlug) {
      setCreatingError("Proposal slug is required.");
      return;
    }
    if (!trimmedContent) {
      setCreatingError("Proposal SKILL.md body is required.");
      return;
    }
    setSubmitting(true);
    setCreatingError("");
    setCreatingMessage("");
    try {
      await desktopRequest("/skills/proposals", "POST", {
        slug: trimmedSlug,
        content: trimmedContent,
      });
      setSlug("");
      setContent("");
      setCreatingMessage("Proposal created. Review queue has been refreshed.");
      proposals.reload();
      if (filter !== "pending") {
        setFilter("pending");
      }
    } catch (error) {
      setCreatingError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const applyMutation = async (id: string, action: "approve" | "reject") => {
    if (!active) return;
    setActionBusy(`${id}:${action}`);
    setMutationError("");
    try {
      const reason = asString(feedbackByProposal[id], "");
      await desktopRequest(
        `/skills/proposals/${encodeURIComponent(id)}/${action}`,
        "POST",
        action === "reject" ? { reason } : {},
      );
      setFeedbackByProposal((current) => ({ ...current, [id]: "" }));
      setRejectingId("");
      proposals.reload();
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setActionBusy("");
    }
  };

  const updateReason = (id: string, value: string) =>
    setFeedbackByProposal((current) => ({ ...current, [id]: value }));

  if (!active) {
    return (
      <section className={SKILL_WORKSHOP_CLASS}>
        <OfflineRouteState>
          Skill proposals and activation actions are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      </section>
    );
  }

  return (
    <section className={SKILL_WORKSHOP_CLASS}>
      {creatingMessage ? <Notice tone="good">{creatingMessage}</Notice> : null}
      <CompactStatStrip
        label="Skill proposal summary"
        stats={[
          { label: "Queue", value: counts.total },
          { label: "Pending", value: counts.pending, tone: "warn" },
          { label: "Approved", value: counts.approved, tone: "good" },
          { label: "Blocked", value: counts.blocked, tone: "bad" },
        ]}
      />

      <details className={SKILL_WORKSHOP_CREATE_CLASS}>
        <summary className={SKILL_WORKSHOP_SUMMARY_CLASS}>
          <span className="grid gap-0.5">
            <strong>Create a skill proposal</strong>
            <small>Paste a slug and raw SKILL.md only when needed.</small>
          </span>
          <span className="font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] uppercase group-open:text-[var(--accent)]">
            New proposal
          </span>
        </summary>
        <form
          className="mx-3.5 mb-3.5 grid gap-3 border-t border-[var(--border)] pt-3"
          onSubmit={submitProposal}
        >
          <label htmlFor="skill-proposal-slug">
            <span>Slug</span>
            <Input
              id="skill-proposal-slug"
              autoCapitalize="none"
              maxLength={63}
              pattern="[a-z0-9][a-z0-9-]{0,62}"
              placeholder="auto-summary"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
          </label>
          <label htmlFor="skill-proposal-content">
            <span>SKILL.md</span>
            <Textarea
              id="skill-proposal-content"
              rows={8}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={
                "---\n" +
                "name: auto-summary\n" +
                "description: Summarize a completed work session.\n" +
                "---\n\n" +
                "# Auto Summary\n\n" +
                "Describe the reusable workflow."
              }
            />
          </label>
          <div className="flex items-center justify-between gap-3 [&_span]:text-[var(--muted)]">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create proposal"}
            </Button>
            <span>{`${content.length} characters`}</span>
          </div>
          {creatingError ? <Notice tone="bad">{creatingError}</Notice> : null}
        </form>
      </details>

      <div className="grid gap-2.5">
        <label htmlFor="skill-proposal-search">
          <span className="sr-only">Search skill proposals</span>
          <Input
            id="skill-proposal-search"
            placeholder="Filter by slug or author"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">Proposal filters</legend>
          {(["all", "pending", "approved", "rejected"] as const).map(
            (value) => (
              <button
                aria-pressed={filter === value}
                key={value}
                type="button"
                className={`${SKILL_FILTER_CLASS} ${filter === value ? SKILL_FILTER_SELECTED_CLASS : ""}`}
                onClick={() => setFilter(value)}
              >
                {value}
              </button>
            ),
          )}
        </fieldset>
      </div>

      {proposals.loading ? (
        <LoadingBlock label="Loading skill proposals…" />
      ) : proposals.error ? (
        <ErrorBlock error={proposals.error} retry={proposals.reload} />
      ) : filtered.length ? (
        <div className={SKILL_WORKSHOP_GRID_CLASS}>
          <div className="grid min-w-0 gap-2.5">
            <h2>Proposal queue</h2>
            <Suspense
              fallback={<LoadingBlock label="Loading proposal cards…" />}
            >
              {filtered.map((proposal) => {
                const isSelected = proposal.id === selectedId;

                return (
                  <SkillProposalCard
                    actionBusy={Boolean(actionBusy)}
                    isRejecting={rejectingId === proposal.id}
                    isSelected={isSelected}
                    key={proposal.id}
                    onApprove={() => void applyMutation(proposal.id, "approve")}
                    onReasonChange={(value) => updateReason(proposal.id, value)}
                    onReject={() => void applyMutation(proposal.id, "reject")}
                    onRejectToggle={() =>
                      setRejectingId((current) =>
                        current === proposal.id ? "" : proposal.id,
                      )
                    }
                    onSelect={() =>
                      setSelectedId((current) =>
                        current === proposal.id ? "" : proposal.id,
                      )
                    }
                    proposal={proposal}
                    rejectionReason={asString(
                      feedbackByProposal[proposal.id],
                      "",
                    )}
                  />
                );
              })}
            </Suspense>
          </div>

          <div className={SKILL_WORKSHOP_PREVIEW_CLASS}>
            <h2>SKILL.md preview</h2>
            {selectedId ? (
              selectedDetail.loading ? (
                <LoadingBlock label="Loading proposal detail…" />
              ) : selectedDetail.error ? (
                <ErrorBlock
                  error={selectedDetail.error}
                  retry={selectedDetail.reload}
                />
              ) : normalizedDetail ? (
                <article className="m-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                      <span className="eyebrow">Exact content</span>
                      <h3>{normalizedDetail.slug}</h3>
                    </div>
                  </div>
                  <pre>
                    <code>
                      {normalizedDetail.content || "No content returned."}
                    </code>
                  </pre>
                  {normalizedDetail.reviewedAt ? (
                    <small>Reviewed {normalizedDetail.reviewedAt}</small>
                  ) : null}
                </article>
              ) : (
                <EmptyBlock title="No proposal selected">
                  Pick a proposal to open its exact SKILL.md content.
                </EmptyBlock>
              )
            ) : (
              <EmptyBlock title="No proposal selected">
                Pick a proposal to open its exact SKILL.md content.
              </EmptyBlock>
            )}
          </div>
        </div>
      ) : (
        <EmptyBlock title="No proposals in this view">
          Try another status filter or refresh.
        </EmptyBlock>
      )}
      {mutationError ? <ErrorBlock error={mutationError} /> : null}
    </section>
  );
}
