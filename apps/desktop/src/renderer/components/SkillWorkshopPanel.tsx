import { type FormEvent, useMemo, useState } from "react";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  PageHeader,
  useApiResource,
} from "../lib";
import "./skill-workshop-panel.css";

interface SkillProposalResponse {
  proposals?: unknown[];
}

interface SkillProposalDetailResponse {
  proposal?: unknown;
}

export type SkillProposalFilter = "all" | "pending" | "approved" | "rejected";

export type SkillProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "blocked"
  | "unknown";

export interface ProposalSafety {
  blocked: boolean;
  badges: string[];
  findings: string[];
  reason: string;
}

export interface SkillProposal {
  id: string;
  slug: string;
  status: SkillProposalStatus;
  author: string;
  createdAt: string;
  reviewedAt: string;
  content: string;
  reason: string;
  safety: ProposalSafety;
}

const normalizeTextArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry, ""))
    .map((entry) => entry.trim())
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 20);
};

const normalizeFindingArray = (value: unknown): string[] =>
  asArray(value)
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      const finding = asRecord(entry);
      const message = asString(finding.message).trim();
      const code = asString(finding.code).trim();
      return [code, message].filter(Boolean).join(" · ");
    })
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 20);

const asBoolean = (value: unknown): boolean =>
  typeof value === "boolean" ? value : String(value).toLowerCase() === "true";

export const normalizeProposalStatus = (
  status: unknown,
): SkillProposalStatus => {
  switch (asString(status, "").toLowerCase().trim()) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "rejected":
    case "deny":
    case "denied":
      return "rejected";
    default:
      return "unknown";
  }
};

export const normalizeProposal = (
  value: unknown,
  fallbackIndex: number,
): SkillProposal => {
  const record = asRecord(value);
  const safetyRecord = asRecord(record.safety);
  const safetyOutcome = asString(record.safety).toLowerCase().trim();
  const id = asString(record.id, `proposal-${fallbackIndex}`);
  const status = normalizeProposalStatus(record.disposition ?? record.status);
  const blocked =
    asBoolean(record.blocked ?? record.blockedFor ?? safetyRecord.blocked) ||
    safetyOutcome === "blocked";
  const normalizedStatus = blocked && status === "pending" ? "blocked" : status;
  const safetyBadges = [
    ...(safetyOutcome ? [safetyOutcome] : []),
    ...normalizeTextArray(safetyRecord.badges),
    ...normalizeTextArray(record.badges),
    ...normalizeTextArray(record.tags),
  ];
  const findings = normalizeFindingArray(
    safetyRecord.findings ?? record.findings,
  );

  return {
    id,
    slug: asString(record.slug, asString(record.name, id)),
    status: normalizedStatus,
    author: asString(
      record.author,
      asString(record.submittedBy, asString(record.taskId, "Manual proposal")),
    ),
    createdAt: asString(record.createdAt, asString(record.createdAtTimestamp)),
    reviewedAt: asString(
      record.decidedAt,
      asString(record.reviewedAt, asString(record.reviewedAtTimestamp)),
    ),
    content: asString(
      record.content,
      asString(record.skillMarkdown, "No SKILL.md content available."),
    ),
    reason: asString(
      record.rejectionReason,
      asString(record.reason, asString(record.reviewReason, "")),
    ),
    safety: {
      blocked,
      reason: asString(record.safetyReason, asString(safetyRecord.reason, "")),
      badges: [...new Set(safetyBadges)].slice(0, 12),
      findings,
    },
  };
};

export const proposalCanApprove = (proposal: SkillProposal): boolean =>
  proposal.status === "pending" && !proposal.safety.blocked;

const proposalTone = (status: SkillProposalStatus): "good" | "warn" | "bad" => {
  switch (status) {
    case "approved":
      return "good";
    case "rejected":
    case "blocked":
      return "bad";
    default:
      return "warn";
  }
};

export const skillWorkshopLabelCounts = (
  proposals: SkillProposal[],
): Record<
  "pending" | "approved" | "rejected" | "blocked" | "total",
  number
> => ({
  pending: proposals.filter((proposal) => proposal.status === "pending").length,
  approved: proposals.filter((proposal) => proposal.status === "approved")
    .length,
  rejected: proposals.filter((proposal) => proposal.status === "rejected")
    .length,
  blocked: proposals.filter((proposal) => proposal.status === "blocked").length,
  total: proposals.length,
});

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
      proposals.reload();
    } catch (error) {
      setMutationError(errorMessage(error));
    } finally {
      setActionBusy("");
    }
  };

  const updateReason = (id: string, value: string) =>
    setFeedbackByProposal((current) => ({ ...current, [id]: value }));

  const statusLabel = (status: SkillProposalStatus) => {
    switch (status) {
      case "approved":
        return "Approved";
      case "rejected":
        return "Rejected";
      case "blocked":
        return "Blocked";
      case "pending":
        return "Pending";
      default:
        return "Unknown";
    }
  };

  return (
    <section className="skill-workshop">
      <PageHeader
        eyebrow="Engineering"
        title="Skill Workshop"
        description="Review proposed SKILL.md payloads, enforce safety checks, and approve or reject before merging into the workspace."
      />
      {creatingMessage ? <Notice tone="good">{creatingMessage}</Notice> : null}
      <div className="skill-workshop-overview">
        <article className="skill-workshop-metric">
          <span>Queue</span>
          <strong>{counts.total}</strong>
          <small>
            {asNumber(counts.pending)} pending, {asNumber(counts.approved)}{" "}
            approved, {asNumber(counts.rejected + counts.blocked)} rejected
          </small>
        </article>
        <article className="skill-workshop-metric">
          <span>Blocked</span>
          <strong>{counts.blocked}</strong>
          <small>Safety policy hard-stop</small>
        </article>
        <article className="skill-workshop-metric">
          <span>Pending</span>
          <strong>{counts.pending}</strong>
          <small>Ready for decision</small>
        </article>
      </div>

      <form
        className="content-card skill-workshop-form"
        onSubmit={submitProposal}
      >
        <div className="skill-workshop-form__heading">
          <h2>Create a skill proposal</h2>
          <p>Paste raw SKILL.md content and a slug for review.</p>
        </div>
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
              const busy =
                actionBusy === `${proposal.id}:approve` ||
                actionBusy === `${proposal.id}:reject`;
              const approveDisabled =
                !proposalCanApprove(proposal) || busy || actionBusy !== "";
              const rejectDisabled = busy || actionBusy !== "";
              const isSelected = proposal.id === selectedId;

              return (
                <article
                  className={`content-card skill-workshop-item ${
                    isSelected ? "is-selected" : ""
                  }`}
                  key={proposal.id}
                >
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">
                        {statusLabel(proposal.status)}
                      </span>
                      <h3>{proposal.slug}</h3>
                    </div>
                    <Badge tone={proposalTone(proposal.status)}>
                      {statusLabel(proposal.status)}
                    </Badge>
                  </div>
                  <div className="skill-workshop-item__facts">
                    <span>By {proposal.author}</span>
                    <span>
                      {proposal.createdAt
                        ? `Submitted ${proposal.createdAt}`
                        : "Submitted"}
                    </span>
                  </div>
                  {proposal.safety.badges.length ? (
                    <div className="skill-workshop-badges">
                      {proposal.safety.badges.map((badge) => (
                        <span className="skill-workshop-badge" key={badge}>
                          {badge}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {proposal.safety.findings.length ? (
                    <div className="skill-workshop-findings">
                      <strong>Findings</strong>
                      <ul>
                        {proposal.safety.findings.map((finding) => (
                          <li key={finding}>{finding}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {proposal.safety.reason ? (
                    <p className="skill-workshop-reason">
                      {proposal.safety.reason}
                    </p>
                  ) : null}

                  <label className="skill-workshop-action-reason">
                    <span>Rejection note</span>
                    <textarea
                      rows={2}
                      value={asString(feedbackByProposal[proposal.id], "")}
                      onChange={(event) =>
                        updateReason(proposal.id, event.target.value)
                      }
                      placeholder="Add a review reason"
                    />
                  </label>
                  <div className="skill-workshop-item__actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setSelectedId(proposal.id)}
                      aria-pressed={isSelected}
                    >
                      {isSelected ? "Hide SKILL.md" : "View SKILL.md"}
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void applyMutation(proposal.id, "approve")}
                      disabled={approveDisabled}
                    >
                      Approve
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void applyMutation(proposal.id, "reject")}
                      disabled={rejectDisabled}
                    >
                      Reject
                    </button>
                  </div>
                  {proposal.safety.blocked ? (
                    <Notice tone="warn">
                      Blocked by safety review. Resolve all findings before
                      approval.
                    </Notice>
                  ) : null}
                  {proposal.status === "blocked" ? (
                    <small>Safety check auto-blocked this proposal.</small>
                  ) : null}
                </article>
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
