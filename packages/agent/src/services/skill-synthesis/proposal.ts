import { parseFrontmatter } from "@elizaos/skills/index";

export const MAX_SKILL_PROPOSAL_CONTENT_LENGTH = 16_000;
export const MAX_SKILL_PROPOSAL_TITLE_LENGTH = 120;
export const MAX_SKILL_PROPOSAL_DESCRIPTION_LENGTH = 360;

export type SkillProposalSafetyOutcome = "clean" | "warn" | "blocked";
export type SkillProposalDisposition = "pending" | "approved" | "rejected";

export interface SkillProposalSafetyFinding {
  outcome: Exclude<SkillProposalSafetyOutcome, "clean">;
  code: string;
  message: string;
}

export interface SkillProposalValidation {
  valid: boolean;
  errors: string[];
  safety: SkillProposalSafetyOutcome;
  findings: SkillProposalSafetyFinding[];
}

export interface SkillProposalRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  taskId: string;
  objective: string;
  noteCount: number;
  signalCount: number;
  createdAt: string;
  updatedAt: string;
  disposition: SkillProposalDisposition;
  decidedAt?: string;
  rejectionReason?: string;
  safety: SkillProposalSafetyOutcome;
  findings: SkillProposalSafetyFinding[];
  activatedPath?: string;
}

export interface CreateSkillProposalInput {
  slug: string;
  title?: string;
  description?: string;
  content: string;
  taskId?: string;
  objective?: string;
  noteCount?: number;
  signalCount?: number;
}

const slugPattern = /^[a-z0-9][a-z0-9-]{0,62}$/u;

const blockedPatterns: Array<{
  code: string;
  message: string;
  pattern: RegExp;
}> = [
  {
    code: "instruction-override",
    message: "Content attempts to override higher-priority instructions.",
    pattern:
      /\b(?:ignore|disregard|override|bypass)\b[\s\S]{0,80}\b(?:previous|prior|system|developer)\b[\s\S]{0,40}\b(?:instruction|prompt|rule)/iu,
  },
  {
    code: "secret-exfiltration",
    message: "Content requests secrets, credentials, or private keys.",
    pattern:
      /\b(?:reveal|exfiltrat(?:e|ion)|send|upload|print)\b[\s\S]{0,100}\b(?:secret|credential|password|api[ _-]?key|private key|access token)\b/iu,
  },
  {
    code: "approval-bypass",
    message: "Content attempts to bypass a safety or approval boundary.",
    pattern:
      /\b(?:disable|bypass|skip)\b[\s\S]{0,80}\b(?:safety|security|approval|confirmation|guardrail)/iu,
  },
];

const warningPatterns: Array<{
  code: string;
  message: string;
  pattern: RegExp;
}> = [
  {
    code: "instruction-like-content",
    message:
      "Content contains instruction-like language and should be reviewed.",
    pattern:
      /\b(?:system prompt|developer instruction|ignore instructions|jailbreak)\b/iu,
  },
  {
    code: "destructive-command",
    message: "Content includes a potentially destructive shell command.",
    pattern: /\brm\s+-[a-z]*r[a-z]*f\b|\b(?:format|mkfs)\b/iu,
  },
];

export function scanSkillProposalContent(content: string): {
  safety: SkillProposalSafetyOutcome;
  findings: SkillProposalSafetyFinding[];
} {
  const blocked = blockedPatterns
    .filter(({ pattern }) => pattern.test(content))
    .map(({ code, message }) => ({
      outcome: "blocked" as const,
      code,
      message,
    }));
  if (blocked.length > 0) {
    return { safety: "blocked", findings: blocked };
  }

  const warnings = warningPatterns
    .filter(({ pattern }) => pattern.test(content))
    .map(({ code, message }) => ({ outcome: "warn" as const, code, message }));
  return {
    safety: warnings.length > 0 ? "warn" : "clean",
    findings: warnings,
  };
}

export function validateSkillProposal(
  input: CreateSkillProposalInput,
): SkillProposalValidation {
  const errors: string[] = [];
  const slug = input.slug.trim();
  const content = input.content.trim();
  if (!slugPattern.test(slug)) {
    errors.push("slug must be 1-63 lowercase letters, numbers, or hyphens");
  }
  if (!content) {
    errors.push("content is required");
  } else if (content.length > MAX_SKILL_PROPOSAL_CONTENT_LENGTH) {
    errors.push(
      `content must be at most ${MAX_SKILL_PROPOSAL_CONTENT_LENGTH} characters`,
    );
  }
  if (
    input.title !== undefined &&
    input.title.trim().length > MAX_SKILL_PROPOSAL_TITLE_LENGTH
  ) {
    errors.push(
      `title must be at most ${MAX_SKILL_PROPOSAL_TITLE_LENGTH} characters`,
    );
  }
  if (
    input.description !== undefined &&
    input.description.trim().length > MAX_SKILL_PROPOSAL_DESCRIPTION_LENGTH
  ) {
    errors.push(
      `description must be at most ${MAX_SKILL_PROPOSAL_DESCRIPTION_LENGTH} characters`,
    );
  }

  if (content) {
    try {
      const { frontmatter } = parseFrontmatter(content);
      if (!frontmatter.name || typeof frontmatter.name !== "string") {
        errors.push("frontmatter.name is required");
      } else if (frontmatter.name !== slug) {
        errors.push("frontmatter.name must match slug");
      }
      if (
        !frontmatter.description ||
        typeof frontmatter.description !== "string"
      ) {
        errors.push("frontmatter.description is required");
      }
    } catch {
      errors.push("content must contain valid skill frontmatter");
    }
  }

  const scan = scanSkillProposalContent(content);
  return { valid: errors.length === 0, errors, ...scan };
}

export function proposalTitleFromContent(
  content: string,
  fallback: string,
): string {
  const heading = content.match(/^#\s+(.+)$/mu)?.[1]?.trim();
  return heading?.slice(0, MAX_SKILL_PROPOSAL_TITLE_LENGTH) || fallback;
}

export function proposalDescriptionFromContent(content: string): string {
  try {
    const { frontmatter } = parseFrontmatter(content);
    return typeof frontmatter.description === "string"
      ? frontmatter.description
      : "";
  } catch {
    return "";
  }
}
