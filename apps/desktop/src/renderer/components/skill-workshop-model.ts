import { asArray, asRecord, asString } from "../lib";

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
      findings: normalizeFindingArray(safetyRecord.findings ?? record.findings),
    },
  };
};

export const proposalCanApprove = (proposal: SkillProposal): boolean =>
  proposal.status === "pending" && !proposal.safety.blocked;

export const proposalTone = (
  status: SkillProposalStatus,
): "good" | "warn" | "bad" => {
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

export const proposalStatusLabel = (status: SkillProposalStatus): string => {
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
