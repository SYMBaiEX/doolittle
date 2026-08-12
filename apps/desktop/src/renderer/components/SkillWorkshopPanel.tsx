import { type FormEvent, useMemo, useState } from "react";
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
import { SkillProposalCard } from "./SkillProposalCard";
import {
  normalizeProposal,
  type SkillProposalFilter,
  skillWorkshopLabelCounts,
} from "./skill-workshop-model";
import "./skill-workshop-panel.css";

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
      <section className="skill-workshop">
        <OfflineRouteState>
          Skill proposals and activation actions are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      </section>
    );
  }

  return (
    <section className="skill-workshop">
      <header className="skill-workshop-header">
        <div>
          <span className="eyebrow">Proposal review</span>
          <h2>Review before activation</h2>
          <p>
            Inspect generated SKILL.md payloads and their safety results before
            they enter the workspace.
          </p>
        </div>
      </header>
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

      <details className="content-card skill-workshop-create">
        <summary>
          <span>
            <strong>Create a skill proposal</strong>
            <small>Paste a slug and raw SKILL.md only when needed.</small>
          </span>
          <span>New proposal</span>
        </summary>
        <form className="skill-workshop-form" onSubmit={submitProposal}>
          <label>
            <span>Slug</span>
            <input
              autoCapitalize="none"
              maxLength={63}
              pattern="[a-z0-9][a-z0-9-]{0,62}"
              placeholder="auto-summary"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
          </label>
          <label>
            <span>SKILL.md</span>
            <textarea
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
          <div className="skill-workshop-form__actions">
            <button
              className="primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create proposal"}
            </button>
            <span>{`${content.length} characters`}</span>
          </div>
          {creatingError ? <Notice tone="bad">{creatingError}</Notice> : null}
        </form>
      </details>

      <div className="skill-workshop-filters">
        <label className="search-field">
          <input
            placeholder="Filter by slug or author"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <fieldset className="skill-workshop-filter-chips">
          <legend className="sr-only">Proposal filters</legend>
          {(["all", "pending", "approved", "rejected"] as const).map(
            (value) => (
              <button
                key={value}
                type="button"
                className={
                  filter === value ? "secondary-button" : "primary-button"
                }
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
        <div className="skill-workshop-grid">
          <div className="skill-workshop-list">
            <h2>Proposal queue</h2>
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
          </div>

          <div className="skill-workshop-preview">
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
                <article className="content-card">
                  <div className="card-heading">
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
