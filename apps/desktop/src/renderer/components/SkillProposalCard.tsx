import { Badge, Notice } from "../lib";
import {
  proposalCanApprove,
  proposalStatusLabel,
  proposalTone,
  type SkillProposal,
} from "./skill-workshop-model";

export function SkillProposalCard({
  actionBusy,
  isRejecting,
  isSelected,
  onApprove,
  onReasonChange,
  onReject,
  onRejectToggle,
  onSelect,
  proposal,
  rejectionReason,
}: {
  actionBusy: boolean;
  isRejecting: boolean;
  isSelected: boolean;
  onApprove: () => void;
  onReasonChange: (value: string) => void;
  onReject: () => void;
  onRejectToggle: () => void;
  onSelect: () => void;
  proposal: SkillProposal;
  rejectionReason: string;
}) {
  const status = proposalStatusLabel(proposal.status);
  const hasSafetyDetail =
    proposal.safety.badges.length > 0 ||
    proposal.safety.findings.length > 0 ||
    Boolean(proposal.safety.reason);

  return (
    <article
      className={`content-card skill-workshop-item ${
        isSelected ? "is-selected" : ""
      }`}
    >
      <div className="card-heading">
        <div>
          <span className="eyebrow">{status}</span>
          <h3>{proposal.slug}</h3>
        </div>
        <Badge tone={proposalTone(proposal.status)}>{status}</Badge>
      </div>
      <div className="skill-workshop-item__facts">
        <span>By {proposal.author}</span>
        <span>
          {proposal.createdAt ? `Submitted ${proposal.createdAt}` : "Submitted"}
        </span>
      </div>

      {hasSafetyDetail ? (
        <details className="skill-workshop-safety">
          <summary>
            <span>Safety review</span>
            <small>
              {proposal.safety.blocked
                ? "Blocked"
                : `${proposal.safety.findings.length} findings`}
            </small>
          </summary>
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
            <ul className="skill-workshop-findings">
              {proposal.safety.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          ) : null}
          {proposal.safety.reason ? (
            <p className="skill-workshop-reason">{proposal.safety.reason}</p>
          ) : null}
        </details>
      ) : null}

      <div className="skill-workshop-item__actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onSelect}
          aria-pressed={isSelected}
        >
          {isSelected ? "Hide SKILL.md" : "View SKILL.md"}
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={onApprove}
          disabled={!proposalCanApprove(proposal) || actionBusy}
        >
          Approve
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={onRejectToggle}
          disabled={actionBusy}
          aria-expanded={isRejecting}
        >
          {isRejecting ? "Cancel rejection" : "Reject"}
        </button>
      </div>

      {isRejecting ? (
        <div className="skill-workshop-reject-panel">
          <label>
            <span>Rejection note</span>
            <textarea
              rows={2}
              value={rejectionReason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Add a review reason"
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            onClick={onReject}
            disabled={actionBusy}
          >
            Confirm rejection
          </button>
        </div>
      ) : null}

      {proposal.safety.blocked ? (
        <Notice tone="warn">
          Approval stays disabled until every safety finding is resolved.
        </Notice>
      ) : null}
    </article>
  );
}
