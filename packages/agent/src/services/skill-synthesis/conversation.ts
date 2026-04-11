import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredMessage } from "@/types";

export interface ConversationSkillCandidate {
  slug: string;
  title: string;
  rationale: string;
  category: string;
  steps: string[];
  signals: string[];
}

export interface ConversationAnalysisResult {
  shouldSynthesize: boolean;
  candidate?: ConversationSkillCandidate;
  reason?: string;
}

export interface ConversationGeneratedSkillRecord {
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

const NOVELTY_SIGNALS = [
  /\b(?:step\s+\d+|first[\s,].*then|finally|workflow|pipeline)\b/iu,
  /\b(?:bash|shell|script|python|typescript|function|class|module)\b/iu,
  /\b(?:success(?:fully)?|complete[d]?|done|finished|solved|fixed)\b/iu,
  /\b(?:turns? out|it seems|found that|discovered|learned|realized)\b/iu,
  /\b(?:repeat|rerun|run\s+again|same\s+approach|similar)\b/iu,
  /\b(?:important|remember|note[: ]|tip[: ]|warning[: ]|pattern)\b/iu,
];

const TRIVIAL_SIGNALS = [
  /\b(?:what\s+is|what'?s|who\s+is|how\s+do\s+i|can\s+you\s+explain)\b/iu,
  /\b(?:hi|hello|thanks|thank\s+you|goodbye|bye)\b/iu,
];

const MIN_MESSAGES_FOR_SYNTHESIS = 4;
const MIN_NOVELTY_SIGNAL_COUNT = 2;

function extractStepsFromMessages(messages: StoredMessage[]): string[] {
  const steps: string[] = [];
  const stepPattern = /^\s*(?:\d+\.|[-*])\s+(.+)/mu;

  for (const msg of messages) {
    for (const line of msg.text.split("\n")) {
      const match = line.match(stepPattern);
      if (match?.[1] && match[1].length > 10 && match[1].length < 200) {
        steps.push(match[1].trim());
        if (steps.length >= 8) {
          break;
        }
      }
    }
    if (steps.length >= 8) {
      break;
    }
  }

  if (!steps.length) {
    for (const msg of messages) {
      const sentences = msg.text
        .split(/[.!?]\s+/)
        .filter((sentence) => sentence.length > 20 && sentence.length < 200)
        .slice(0, 2);
      steps.push(...sentences);
      if (steps.length >= 4) {
        break;
      }
    }
  }

  return steps.slice(0, 8);
}

function inferCategory(fullText: string): string {
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
    ["productivity", /\b(?:task|todo|plan|organize|manage|track|project)\b/iu],
  ];

  for (const [category, pattern] of categories) {
    if (pattern.test(fullText)) {
      return category;
    }
  }
  return "general";
}

export function analyzeConversationForSkill(
  messages: StoredMessage[],
): ConversationAnalysisResult {
  if (messages.length < MIN_MESSAGES_FOR_SYNTHESIS) {
    return { shouldSynthesize: false, reason: "Conversation too short" };
  }

  const assistantMessages = messages.filter(
    (message) => message.role === "assistant",
  );
  const fullText = messages.map((message) => message.text).join("\n");
  const firstUser = messages.find((message) => message.role === "user");

  if (
    firstUser &&
    TRIVIAL_SIGNALS.some((pattern) => pattern.test(firstUser.text))
  ) {
    return { shouldSynthesize: false, reason: "Appears to be a simple Q&A" };
  }

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

  const rawTitle =
    firstUser?.text.split("\n")[0]?.slice(0, 80).trim() ?? "Learned Workflow";
  const title = rawTitle.replace(/[^\w\s-]/g, "").trim() || "Learned Workflow";
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return {
    shouldSynthesize: true,
    candidate: {
      slug: slug || "learned-workflow",
      title,
      rationale: `Detected ${matchedSignals.length} novelty signals in a ${messages.length}-turn conversation: ${matchedSignals.slice(0, 3).join(", ")}`,
      category: inferCategory(fullText),
      steps: extractStepsFromMessages(assistantMessages),
      signals: matchedSignals.slice(0, 8),
    },
  };
}

export function writeConversationSkillDocument(input: {
  generatedDir: string;
  candidate: ConversationSkillCandidate;
  messages: StoredMessage[];
  sessionId: string;
  createdAt: string;
  updatedAt: string;
}): string {
  const dir = join(input.generatedDir, input.candidate.slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "SKILL.md");
  const excerpt = input.messages
    .slice(0, 6)
    .map((message) => `**[${message.role}]** ${message.text.slice(0, 200)}`)
    .join("\n\n");

  const content = [
    `# ${input.candidate.title}`,
    "",
    `> Auto-synthesized from session \`${input.sessionId}\` on ${input.updatedAt.split("T")[0]}.`,
    "",
    "## Category",
    input.candidate.category,
    "",
    "## When to Use",
    `Use this skill when a task resembles: "${input.candidate.title.toLowerCase()}"`,
    "",
    "## Why This Was Saved",
    input.candidate.rationale,
    "",
    "## Key Steps",
    ...input.candidate.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Novelty Signals Detected",
    ...input.candidate.signals.map((signal) => `- ${signal}`),
    "",
    "## Conversation Context (excerpt)",
    excerpt,
    "",
    "## Metadata",
    `- Session ID: ${input.sessionId}`,
    `- Turn count: ${input.messages.length}`,
    `- Category: ${input.candidate.category}`,
    `- Created: ${input.createdAt}`,
    `- Updated: ${input.updatedAt}`,
    "",
    "## Usage",
    "Review the key steps above and adapt them to the current task context.",
  ].join("\n");

  writeFileSync(path, content, "utf8");
  return path;
}

export function buildConversationGeneratedSkillRecord(input: {
  candidate: ConversationSkillCandidate;
  sessionId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}): ConversationGeneratedSkillRecord {
  return {
    slug: input.candidate.slug,
    title: input.candidate.title,
    taskId: `conversation:${input.sessionId}`,
    path: input.path,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    noteCount: input.candidate.steps.length,
    signalCount: input.candidate.signals.length,
    objective: input.candidate.rationale,
  };
}
