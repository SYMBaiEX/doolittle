import { Button } from "@elizaos/ui/components/ui/button";
import { Textarea } from "@elizaos/ui/components/ui/textarea";
import { Badge, Notice } from "../lib";
import { SKILL_WORKSHOP_CARD_CLASS } from "./skill-workshop-layout";
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
      className={`${SKILL_WORKSHOP_CARD_CLASS} ${isSelected ? "border-[var(--accent-border)]" : ""}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="eyebrow">{status}</span>
          <h3>{proposal.slug}</h3>
        </div>
        <Badge tone={proposalTone(proposal.status)}>{status}</Badge>
      </div>
      <div className="flex justify-between gap-2 text-[var(--muted)] [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap">
        <span>By {proposal.author}</span>
        <span>
          {proposal.createdAt ? `Submitted ${proposal.createdAt}` : "Submitted"}
        </span>
      </div>

      {hasSafetyDetail ? (
        <details className="group border-y border-[var(--border)] open:pb-2.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
            <span>Safety review</span>
            <small className="text-[var(--muted)]">
              {proposal.safety.blocked
                ? "Blocked"
                : `${proposal.safety.findings.length} findings`}
            </small>
          </summary>
          {proposal.safety.badges.length ? (
            <div className="flex flex-wrap gap-1.5">
              {proposal.safety.badges.map((badge) => (
                <span
                  className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-1 text-[0.78rem] text-[color-mix(in_srgb,var(--accent)_92%,white)]"
                  key={badge}
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
          {proposal.safety.findings.length ? (
            <ul className="mt-2 mb-0 pl-[18px] text-sm text-[var(--text-soft)]">
              {proposal.safety.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          ) : null}
          {proposal.safety.reason ? (
            <p className="mt-2 mb-0 text-sm text-[var(--text-soft)]">
              {proposal.safety.reason}
            </p>
          ) : null}
        </details>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={onSelect}
          aria-pressed={isSelected}
          size="sm"
          variant="secondary"
        >
          {isSelected ? "Hide SKILL.md" : "View SKILL.md"}
        </Button>
        <Button
          type="button"
          onClick={onApprove}
          disabled={!proposalCanApprove(proposal) || actionBusy}
          size="sm"
        >
          Approve
        </Button>
        <Button
          type="button"
          onClick={onRejectToggle}
          disabled={actionBusy}
          aria-expanded={isRejecting}
          size="sm"
          variant="secondary"
        >
          {isRejecting ? "Cancel rejection" : "Reject"}
        </Button>
      </div>

      {isRejecting ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-[var(--border)] pt-2.5 max-[760px]:grid-cols-1">
          <label
            className="grid gap-[5px]"
            htmlFor={`skill-rejection-${proposal.id}`}
          >
            <span>Rejection note</span>
            <Textarea
              id={`skill-rejection-${proposal.id}`}
              rows={2}
              value={rejectionReason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Add a review reason"
            />
          </label>
          <Button
            type="button"
            onClick={onReject}
            disabled={actionBusy}
            size="sm"
            variant="secondary"
          >
            Confirm rejection
          </Button>
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

export default SkillProposalCard;
