import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DelegationTaskRecord, StoredMessage } from "@/types";

interface GeneratedSkillRecord {
  slug: string;
  title: string;
  taskId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  signalCount: number;
  objective: string;
}

interface GeneratedSkillIndex {
  skills: GeneratedSkillRecord[];
}

// ---------------------------------------------------------------------------
// Post-session conversation analysis types
// ---------------------------------------------------------------------------

export interface ConversationSkillCandidate {
  /** Suggested skill slug (kebab-case). */
  slug: string;
  /** Human-readable title. */
  title: string;
  /** Why this conversation warrants a new skill. */
  rationale: string;
  /** Detected category for organisation. */
  category: string;
  /** Key steps or patterns extracted from the conversation. */
  steps: string[];
  /** Keywords / signals that triggered detection. */
  signals: string[];
}

export interface ConversationAnalysisResult {
  /** Whether the conversation is worth synthesising a skill for. */
  shouldSynthesize: boolean;
  candidate?: ConversationSkillCandidate;
  /** Human-readable reason when shouldSynthesize is false. */
  reason?: string;
}

// Phrases that suggest a novel, reusable workflow was performed
const NOVELTY_SIGNALS = [
  // Multi-step workflows
  /\b(?:step\s+\d+|first[\s,].*then|finally|workflow|pipeline)\b/iu,
  // Shell/code patterns
  /\b(?:bash|shell|script|python|typescript|function|class|module)\b/iu,
  // Successful completion
  /\b(?:success(?:fully)?|complete[d]?|done|finished|solved|fixed)\b/iu,
  // Learning moments
  /\b(?:turns? out|it seems|found that|discovered|learned|realized)\b/iu,
  // Repeated actions
  /\b(?:repeat|rerun|run\s+again|same\s+approach|similar)\b/iu,
  // Important patterns
  /\b(?:important|remember|note[: ]|tip[: ]|warning[: ]|pattern)\b/iu,
];

// Phrases that indicate a simple Q&A that doesn't warrant a skill
const TRIVIAL_SIGNALS = [
  /\b(?:what\s+is|what'?s|who\s+is|how\s+do\s+i|can\s+you\s+explain)\b/iu,
  /\b(?:hi|hello|thanks|thank\s+you|goodbye|bye)\b/iu,
];

// Minimum thresholds
const MIN_MESSAGES_FOR_SYNTHESIS = 4;
const MIN_NOVELTY_SIGNAL_COUNT = 2;

export class SkillSynthesisService {
  private readonly generatedDir: string;
  private readonly indexPath: string;

  constructor(private readonly skillsDir: string) {
    this.generatedDir = join(this.skillsDir, "generated");
    this.indexPath = join(this.generatedDir, "index.json");
    mkdirSync(this.generatedDir, { recursive: true });
    if (!existsSync(this.indexPath)) {
      this.writeIndex({ skills: [] });
    }
  }

  synthesizeFromTask(task: DelegationTaskRecord): string {
    const slug = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
    const dir = join(this.generatedDir, slug || "generated-skill");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "SKILL.md");
    const index = this.readIndex();
    const existing = index.skills.find(
      (record) => record.slug === (slug || "generated-skill"),
    );
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const content = [
      `# ${task.title}`,
      "",
      `Generated from delegated task ${task.id}.`,
      "",
      "## Objective",
      task.objective,
      "",
      "## When to Use",
      `Use this skill when a task resembles ${task.title.toLowerCase()} or when the same workflow appears again.`,
      "",
      "## Procedure",
      "1. Review the objective and notes.",
      "2. Identify the smallest reusable workflow.",
      "3. Execute the workflow and capture the result.",
      "4. Fold the stable steps back into the skill.",
      "",
      "## Notes",
      ...(task.notes.length ? task.notes : ["No notes recorded."]),
      "",
      "## Signals",
      ...(this.extractSignals(task.notes).length
        ? this.extractSignals(task.notes).map((note) => `- ${note}`)
        : ["- No strong signals recorded yet."]),
      "",
      "## Metadata",
      `- Task ID: ${task.id}`,
      `- Task Status: ${task.status}`,
      `- Attempts: ${task.attempts}`,
      `- Signal Count: ${this.extractSignals(task.notes).length}`,
      `- Last Updated: ${updatedAt}`,
      `- Created: ${createdAt}`,
      "",
      "## Usage",
      "Apply this skill when a similar delegated workflow needs to be repeated.",
    ].join("\n");
    writeFileSync(path, content, "utf8");
    this.writeIndex({
      skills: [
        ...index.skills.filter(
          (record) => record.slug !== (slug || "generated-skill"),
        ),
        {
          slug: slug || "generated-skill",
          title: task.title,
          taskId: task.id,
          path,
          createdAt,
          updatedAt,
          noteCount: task.notes.length,
          signalCount: this.extractSignals(task.notes).length,
          objective: task.objective,
        },
      ],
    });
    return path;
  }

  synthesize(task: DelegationTaskRecord): string {
    return this.synthesizeFromTask(task);
  }

  // -------------------------------------------------------------------------
  // Post-session conversation-based skill synthesis
  // -------------------------------------------------------------------------

  /**
   * Analyses a list of stored messages from a completed session and decides
   * whether the conversation warrants creating a new reusable skill document.
   *
   * Returns a `ConversationAnalysisResult` that callers can use to:
   *   1. Decide whether to prompt the user ("Would you like to save this as a skill?")
   *   2. Immediately synthesize without confirmation (autonomous mode)
   */
  analyzeConversation(messages: StoredMessage[]): ConversationAnalysisResult {
    if (messages.length < MIN_MESSAGES_FOR_SYNTHESIS) {
      return { shouldSynthesize: false, reason: "Conversation too short" };
    }

    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const fullText = messages.map((m) => m.text).join("\n");

    // Check for trivial Q&A (first user message heuristic)
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser && TRIVIAL_SIGNALS.some((r) => r.test(firstUser.text))) {
      return { shouldSynthesize: false, reason: "Appears to be a simple Q&A" };
    }

    // Count novelty signals across all text
    const matchedSignals: string[] = [];
    for (const pattern of NOVELTY_SIGNALS) {
      const matches = fullText.match(pattern);
      if (matches) {
        matchedSignals.push(matches[0]);
      }
    }

    if (matchedSignals.length < MIN_NOVELTY_SIGNAL_COUNT) {
      return {
        shouldSynthesize: false,
        reason: `Only ${matchedSignals.length} novelty signal(s) detected (minimum ${MIN_NOVELTY_SIGNAL_COUNT})`,
      };
    }

    // Extract a title from the first user message
    const rawTitle =
      firstUser?.text.split("\n")[0]?.slice(0, 80).trim() ?? "Learned Workflow";
    const title =
      rawTitle.replace(/[^\w\s-]/g, "").trim() || "Learned Workflow";
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Extract key steps from assistant messages
    const steps = this.extractStepsFromMessages(assistantMessages);

    // Determine category from signals
    const category = this.inferCategory(fullText);

    return {
      shouldSynthesize: true,
      candidate: {
        slug: slug || "learned-workflow",
        title,
        rationale: `Detected ${matchedSignals.length} novelty signals in a ${messages.length}-turn conversation: ${matchedSignals.slice(0, 3).join(", ")}`,
        category,
        steps,
        signals: matchedSignals.slice(0, 8),
      },
    };
  }

  /**
   * Synthesizes a skill document from a conversation analysis candidate and
   * writes it to disk. Returns the path of the created file.
   */
  synthesizeFromConversation(
    candidate: ConversationSkillCandidate,
    messages: StoredMessage[],
    sessionId: string,
  ): string {
    const dir = join(this.generatedDir, candidate.slug);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "SKILL.md");

    const index = this.readIndex();
    const existing = index.skills.find((r) => r.slug === candidate.slug);
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const updatedAt = new Date().toISOString();

    // Extract a concise conversation excerpt for context
    const excerpt = messages
      .slice(0, 6)
      .map((m) => `**[${m.role}]** ${m.text.slice(0, 200)}`)
      .join("\n\n");

    const content = [
      `# ${candidate.title}`,
      "",
      `> Auto-synthesized from session \`${sessionId}\` on ${updatedAt.split("T")[0]}.`,
      "",
      "## Category",
      candidate.category,
      "",
      "## When to Use",
      `Use this skill when a task resembles: "${candidate.title.toLowerCase()}"`,
      "",
      "## Why This Was Saved",
      candidate.rationale,
      "",
      "## Key Steps",
      ...candidate.steps.map((step, i) => `${i + 1}. ${step}`),
      "",
      "## Novelty Signals Detected",
      ...candidate.signals.map((s) => `- ${s}`),
      "",
      "## Conversation Context (excerpt)",
      excerpt,
      "",
      "## Metadata",
      `- Session ID: ${sessionId}`,
      `- Turn count: ${messages.length}`,
      `- Category: ${candidate.category}`,
      `- Created: ${createdAt}`,
      `- Updated: ${updatedAt}`,
      "",
      "## Usage",
      "Review the key steps above and adapt them to the current task context.",
    ].join("\n");

    writeFileSync(path, content, "utf8");

    const fakeTaskId = `conversation:${sessionId}`;
    this.writeIndex({
      skills: [
        ...index.skills.filter((r) => r.slug !== candidate.slug),
        {
          slug: candidate.slug,
          title: candidate.title,
          taskId: fakeTaskId,
          path,
          createdAt,
          updatedAt,
          noteCount: candidate.steps.length,
          signalCount: candidate.signals.length,
          objective: candidate.rationale,
        },
      ],
    });

    return path;
  }

  /**
   * Combined helper: analyses the conversation and, if warranted, synthesizes
   * a skill document immediately. Returns the skill path or undefined.
   */
  maybeAutoSynthesize(
    messages: StoredMessage[],
    sessionId: string,
  ): { path: string; candidate: ConversationSkillCandidate } | undefined {
    const analysis = this.analyzeConversation(messages);
    if (!analysis.shouldSynthesize || !analysis.candidate) {
      return undefined;
    }
    const path = this.synthesizeFromConversation(
      analysis.candidate,
      messages,
      sessionId,
    );
    return { path, candidate: analysis.candidate };
  }

  // -------------------------------------------------------------------------
  // Private helpers for conversation analysis
  // -------------------------------------------------------------------------

  private extractStepsFromMessages(messages: StoredMessage[]): string[] {
    const steps: string[] = [];
    const stepPattern = /^\s*(?:\d+\.|[-*])\s+(.+)/mu;

    for (const msg of messages) {
      for (const line of msg.text.split("\n")) {
        const match = line.match(stepPattern);
        if (match?.[1] && match[1].length > 10 && match[1].length < 200) {
          steps.push(match[1].trim());
          if (steps.length >= 8) break;
        }
      }
      if (steps.length >= 8) break;
    }

    if (!steps.length) {
      // Fallback: take first meaningful sentences from assistant messages
      for (const msg of messages) {
        const sentences = msg.text
          .split(/[.!?]\s+/)
          .filter((s) => s.length > 20 && s.length < 200)
          .slice(0, 2);
        steps.push(...sentences);
        if (steps.length >= 4) break;
      }
    }

    return steps.slice(0, 8);
  }

  private inferCategory(fullText: string): string {
    const categories: Array<[string, RegExp]> = [
      [
        "software-development",
        /\b(?:code|function|class|typescript|javascript|python|rust|go|compile|build|test)\b/iu,
      ],
      [
        "data-science",
        /\b(?:dataset|dataframe|pandas|numpy|analysis|plot|chart|model|train)\b/iu,
      ],
      [
        "operations",
        /\b(?:deploy|docker|kubernetes|ssh|server|nginx|systemd|cron|daemon)\b/iu,
      ],
      [
        "research",
        /\b(?:research|analyse|investigate|compare|benchmark|evaluate|study)\b/iu,
      ],
      [
        "automation",
        /\b(?:automate|script|workflow|pipeline|schedule|batch)\b/iu,
      ],
      [
        "documentation",
        /\b(?:document|readme|wiki|guide|spec|rfc|changelog)\b/iu,
      ],
      [
        "productivity",
        /\b(?:task|todo|plan|organize|manage|track|project)\b/iu,
      ],
    ];

    for (const [category, pattern] of categories) {
      if (pattern.test(fullText)) {
        return category;
      }
    }
    return "general";
  }

  hasGeneratedSkill(task: DelegationTaskRecord): boolean {
    const slug = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
    return existsSync(
      join(this.generatedDir, slug || "generated-skill", "SKILL.md"),
    );
  }

  listGeneratedSkills(limit = 20): GeneratedSkillRecord[] {
    return this.readIndex()
      .skills.slice()
      .sort((a, b) =>
        (b.updatedAt ?? b.createdAt ?? "").localeCompare(
          a.updatedAt ?? a.createdAt ?? "",
        ),
      )
      .slice(0, limit);
  }

  getGeneratedSkill(slug: string): GeneratedSkillRecord | undefined {
    return this.readIndex().skills.find((record) => record.slug === slug);
  }

  describeGeneratedSkill(slug: string): string {
    const record = this.getGeneratedSkill(slug);
    if (!record) {
      return `Generated skill not found: ${slug}`;
    }
    const content = existsSync(record.path)
      ? readFileSync(record.path, "utf8")
      : "";
    return [
      `GENERATED SKILL: ${record.title}`,
      `Slug: ${record.slug}`,
      `Task ID: ${record.taskId}`,
      `Objective: ${record.objective}`,
      `Notes: ${record.noteCount}`,
      `Signals: ${record.signalCount}`,
      `Updated: ${record.updatedAt}`,
      `Path: ${record.path}`,
      "",
      content.slice(0, 4000),
    ].join("\n");
  }

  private extractSignals(notes: string[]): string[] {
    return notes
      .flatMap((note) => note.split(/\n+/u))
      .map((line) => line.replace(/^(?:-|\*|\d+\.)\s*/u, "").trim())
      .filter((line) => line.length > 0)
      .filter((line) =>
        /must|should|requires?|important|warning|step|workflow|pattern|repeat|reuse/iu.test(
          line,
        ),
      )
      .slice(0, 8);
  }

  private readIndex(): GeneratedSkillIndex {
    if (!existsSync(this.indexPath)) {
      return { skills: [] };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.indexPath, "utf8")) as {
        skills?: Array<Partial<GeneratedSkillRecord>>;
      };
      return {
        skills: Array.isArray(parsed.skills)
          ? parsed.skills
              .filter(
                (
                  record,
                ): record is Partial<GeneratedSkillRecord> &
                  Pick<
                    GeneratedSkillRecord,
                    "slug" | "title" | "taskId" | "path"
                  > =>
                  Boolean(
                    record.slug && record.title && record.taskId && record.path,
                  ),
              )
              .map((record) => ({
                slug: record.slug,
                title: record.title,
                taskId: record.taskId,
                path: record.path,
                createdAt: record.createdAt ?? new Date(0).toISOString(),
                updatedAt:
                  record.updatedAt ??
                  record.createdAt ??
                  new Date(0).toISOString(),
                noteCount: record.noteCount ?? 0,
                signalCount: record.signalCount ?? 0,
                objective: record.objective ?? "",
              }))
          : [],
      };
    } catch {
      return { skills: [] };
    }
  }

  private writeIndex(index: GeneratedSkillIndex): void {
    writeFileSync(this.indexPath, JSON.stringify(index, null, 2), "utf8");
  }
}
