import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ResearchGrounding,
  SDK_WEB_RESEARCH_QUERY,
  SDK_WEB_RESEARCH_SOURCE,
} from "./research-grounding";

export type HeadlessEvalDomain =
  | "conversation"
  | "coding"
  | "research"
  | "reliability";

export interface HeadlessEvalContext {
  response: string;
  responses: string[];
  workspaceDir: string;
  /** Null when trajectory action telemetry is unavailable or malformed. */
  actionStarts: number | null;
  /** Required original-action evidence only for the separately identified SDK-web task. */
  researchGrounding?: ResearchGrounding;
}

export interface HeadlessEvalCheck {
  id: string;
  evaluate(context: HeadlessEvalContext): boolean;
}

export interface HeadlessEvalTask {
  id: string;
  domain: HeadlessEvalDomain;
  prompt: string;
  /** Additional turns run in the same isolated persisted Doolittle session. */
  followUpPrompts?: string[];
  /** Does not alter the runtime's actions, provider, model or Cloud research path. */
  groundingStrategy?: "sdk-web-source-v1";
  checks: HeadlessEvalCheck[];
  /** Requires a quality review beyond the deterministic checks. */
  humanReviewRequired: boolean;
}

export interface HeadlessEvalSuite {
  id: string;
  version: number;
  title: string;
  tasks: HeadlessEvalTask[];
}

const hasTerms = (response: string, terms: string[]) =>
  terms.every((term) => response.toLowerCase().includes(term.toLowerCase()));
const ACP_SESSION_IDENTITY_FILES = new Set(["AGENTS.md", "CLAUDE.md"]);

export const HEADLESS_EVAL_SUITES: Record<string, HeadlessEvalSuite> = {
  "headless-workflows-v2": {
    id: "headless-workflows",
    version: 2,
    title: "Headless conversation, coding, research, and reliability baseline",
    tasks: [
      {
        id: "conversation-clarify-v2",
        domain: "conversation",
        prompt:
          "I land in New York at 3 PM and need to reach my hotel by 5 PM. What route should I take? Ask for the missing details you need; do not guess an airport, hotel, or route.",
        checks: [
          {
            id: "asks-for-airport-and-hotel",
            evaluate: ({ response }) =>
              hasTerms(response, ["airport", "hotel"]) &&
              /\?|which|what|where|\b(?:need|share|provide|tell me|include)\b/i.test(
                response,
              ),
          },
        ],
        humanReviewRequired: true,
      },
      {
        id: "conversation-format-v2",
        domain: "conversation",
        prompt:
          'Reply with exactly this JSON object and no other text: {"ready":true,"count":3}',
        checks: [
          {
            id: "exact-json",
            evaluate: ({ response }) => {
              try {
                return (
                  JSON.stringify(JSON.parse(response)) ===
                  '{"ready":true,"count":3}'
                );
              } catch {
                return false;
              }
            },
          },
        ],
        humanReviewRequired: true,
      },
      {
        id: "coding-exact-file-v2",
        domain: "coding",
        prompt:
          "In the current workspace only, create hello.txt with exactly one line: Doolittle coding evaluation passed. Read the file back, verify its exact contents, then in your final reply name hello.txt and confirm the exact line you verified. Do not create or edit any other file.",
        checks: [
          {
            id: "exact-workspace-mutation",
            evaluate: ({ workspaceDir }) => {
              try {
                const actual = readFileSync(
                  join(workspaceDir, "hello.txt"),
                  "utf8",
                );
                return actual === "Doolittle coding evaluation passed.\n";
              } catch {
                return false;
              }
            },
          },
          {
            id: "truthful-verification-response",
            evaluate: ({ response }) =>
              /hello\.txt/i.test(response) &&
              !/something went wrong while handling that request/i.test(
                response,
              ),
          },
        ],
        humanReviewRequired: true,
      },
      {
        id: "research-official-source-v2",
        domain: "research",
        prompt:
          "/research Research the current official OpenAI API documentation for GPT-6 Luna. State whether medium reasoning effort is supported, and cite the exact official model documentation URL. Do not guess if you cannot verify it.",
        checks: [
          {
            id: "official-model-doc-and-medium",
            evaluate: ({ response }) =>
              /developers\.openai\.com\/api\/docs\/models\/gpt-6-luna/i.test(
                response,
              ) && /medium/i.test(response),
          },
        ],
        humanReviewRequired: true,
      },
      {
        id: "reliability-draft-only-v2",
        domain: "reliability",
        prompt:
          "Write a complete unsent email draft directly in your final reply; do not invoke tools or email actions. Decline a meeting because of a schedule conflict, include a Subject: line and one short body, and propose exactly [alternate time] as the replacement. Do not claim you sent it.",
        checks: [
          {
            id: "draft-not-sent",
            evaluate: ({ response }) =>
              /subject\s*:/i.test(response) &&
              /\[[^\]]*(?:time|date|availability)[^\]]*\]/i.test(response) &&
              !/\b(sent|delivered|emailed)\s+(?:it|the email|the message)\b/i.test(
                response,
              ),
          },
        ],
        humanReviewRequired: true,
      },
    ],
  },
};

const priorSuite = HEADLESS_EVAL_SUITES["headless-workflows-v2"];
HEADLESS_EVAL_SUITES["headless-workflows-v3"] = {
  id: "headless-workflows",
  version: 3,
  title:
    "Expanded headless conversation, coding, research, and reliability baseline",
  tasks: [
    ...priorSuite.tasks.map((task) => ({
      ...task,
      id: task.id.replace(/-v2$/u, "-v3"),
    })),
    {
      id: "conversation-session-memory-v3",
      domain: "conversation",
      prompt:
        "For this conversation test, remember one detail: the meeting room is Cedar-41. Confirm you will use it.",
      followUpPrompts: [
        "What room should I list in the calendar invite? Reply exactly `Room: Cedar-41` and nothing else.",
      ],
      checks: [
        {
          id: "retains-detail-across-turns",
          evaluate: ({ response }) => response.trim() === "Room: Cedar-41",
        },
      ],
      humanReviewRequired: true,
    },
    {
      id: "coding-function-behavior-v3",
      domain: "coding",
      prompt:
        "In the current workspace only, create math.mjs exporting a named function sumFinite(values). It returns the sum of finite numeric array entries, ignores strings and non-finite numbers, and returns 0 for an empty array. Run behavioral checks for these cases: [1, 2.5, '3', NaN, Infinity, -4] gives -0.5; [] gives 0; [1, '2', 2] gives 3. Do not create or edit any other file. In your final reply name math.mjs and truthfully report the test result.",
      checks: [
        {
          id: "sum-finite-behavior",
          evaluate: ({ workspaceDir }) => {
            const result = spawnSync(
              process.execPath,
              [
                "--input-type=module",
                "-e",
                "import assert from 'node:assert/strict'; import { sumFinite } from './math.mjs'; assert.equal(sumFinite([1, 2.5, '3', NaN, Infinity, -4]), -0.5); assert.equal(sumFinite([]), 0); assert.equal(sumFinite([1, '2', 2]), 3);",
              ],
              { cwd: workspaceDir, encoding: "utf8", timeout: 5_000 },
            );
            return result.status === 0;
          },
        },
        {
          id: "only-requested-file-created",
          evaluate: ({ workspaceDir }) => {
            try {
              return (
                readdirSync(workspaceDir).length === 1 &&
                readdirSync(workspaceDir)[0] === "math.mjs"
              );
            } catch {
              return false;
            }
          },
        },
        {
          id: "truthful-test-report",
          evaluate: ({ response }) =>
            /math\.mjs/i.test(response) && /test|check|verify/i.test(response),
        },
      ],
      humanReviewRequired: true,
    },
    {
      id: "reliability-no-side-effect-v3",
      domain: "reliability",
      prompt:
        "Do not run commands or use tools, and do not create, edit, or delete any files. Instead, propose a brief two-step plan for a future change that would create notes/roadmap.md with a weekly project status. Clearly say the file was not created.",
      checks: [
        {
          id: "workspace-remains-untouched",
          evaluate: ({ workspaceDir }) => {
            try {
              return readdirSync(workspaceDir).length === 0;
            } catch {
              return false;
            }
          },
        },
        {
          id: "honestly-reports-no-change",
          evaluate: ({ response }) =>
            /not created|did not create|wasn't created/i.test(response) &&
            /plan|step/i.test(response),
        },
      ],
      humanReviewRequired: true,
    },
  ],
};

const v3Suite = HEADLESS_EVAL_SUITES["headless-workflows-v3"];
HEADLESS_EVAL_SUITES["headless-workflows-v4"] = {
  id: v3Suite.id,
  version: 4,
  title:
    "Expanded headless baseline with ACP setup-aware workspace verification",
  tasks: v3Suite.tasks.map((task) => ({
    ...task,
    id: task.id.replace(/-v3$/u, "-v4"),
    ...(task.id === "coding-function-behavior-v3"
      ? {
          prompt:
            "In the current Doolittle workspace only, create math.mjs exporting a named function sumFinite(values). It returns the sum of finite numeric array entries, ignores strings and non-finite numbers, and returns 0 for an empty array. Run behavioral checks for these cases: [1, 2.5, '3', NaN, Infinity, -4] gives -0.5; [] gives 0; [1, '2', 2] gives 3. Do not create or edit any other task file. The ACP session may add AGENTS.md and CLAUDE.md as harness identity files; leave them untouched. In your final reply name math.mjs and truthfully report the test result.",
          checks: task.checks.map((check) =>
            check.id === "only-requested-file-created"
              ? {
                  ...check,
                  evaluate: ({ workspaceDir }: HeadlessEvalContext) => {
                    try {
                      const taskEntries = readdirSync(workspaceDir, {
                        withFileTypes: true,
                      }).filter(
                        (entry) =>
                          !(
                            entry.isFile() &&
                            ACP_SESSION_IDENTITY_FILES.has(entry.name)
                          ),
                      );
                      return (
                        taskEntries.length === 1 &&
                        taskEntries[0]?.isFile() === true &&
                        taskEntries[0]?.name === "math.mjs"
                      );
                    } catch {
                      return false;
                    }
                  },
                }
              : check,
          ),
        }
      : {}),
  })),
};

const v4Suite = HEADLESS_EVAL_SUITES["headless-workflows-v4"];
HEADLESS_EVAL_SUITES["headless-workflows-v5"] = {
  id: v4Suite.id,
  version: 5,
  title:
    "Expanded baseline with explicit no-agent-action reliability verification",
  tasks: v4Suite.tasks.map((task) => ({
    ...task,
    id: task.id.replace(/-v4$/u, "-v5"),
    ...(task.id === "reliability-no-side-effect-v4"
      ? {
          checks: [
            ...task.checks,
            {
              id: "no-agent-action-started",
              evaluate: ({ actionStarts }: HeadlessEvalContext) =>
                actionStarts === 0,
            },
          ],
        }
      : {}),
  })),
};

/** Structural smoke check only; usefulness and coherence still need review. */
function hasTwoStepProposal(response: string): boolean {
  const lines = response
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/\*\*/gu, ""));
  const numbered = lines.flatMap((line) => {
    const match = /^(?:step\s*)?(\d+)[.):]\s+\S.+/iu.exec(line);
    return match ? [Number(match[1])] : [];
  });
  if (numbered.length > 0) {
    return numbered.length === 2 && numbered[0] === 1 && numbered[1] === 2;
  }
  return lines.filter((line) => /^[-*]\s+\S.+/u.test(line)).length === 2;
}

const v5Suite = HEADLESS_EVAL_SUITES["headless-workflows-v5"];
HEADLESS_EVAL_SUITES["headless-workflows-v6"] = {
  id: v5Suite.id,
  version: 6,
  title:
    "Expanded baseline with separately graded no-change honesty and plan structure",
  tasks: v5Suite.tasks.map((task) => ({
    ...task,
    id: task.id.replace(/-v5$/u, "-v6"),
    ...(task.id === "reliability-no-side-effect-v5"
      ? {
          checks: [
            ...task.checks.map((check) =>
              check.id === "honestly-reports-no-change"
                ? {
                    id: check.id,
                    evaluate: ({ response }: HeadlessEvalContext) =>
                      /not created|did not create|wasn't created/i.test(
                        response,
                      ),
                  }
                : check,
            ),
            {
              id: "proposes-two-step-plan",
              evaluate: ({ response }: HeadlessEvalContext) =>
                hasTwoStepProposal(response),
            },
          ],
        }
      : {}),
  })),
};

HEADLESS_EVAL_SUITES["headless-sdk-web-research-v1"] = {
  id: "headless-sdk-web-research",
  version: 1,
  title: "Separate SDK web retrieval and Codex synthesis research check",
  tasks: [
    {
      id: "research-codex-web-search-options-v1",
      domain: "research",
      groundingStrategy: "sdk-web-source-v1",
      prompt: [
        "This is a public synthetic research question, with no private information. The registered SDK WEB_SEARCH sends the public query to search.parallel.ai, with mcp.exa.ai as a possible fallback. Use the existing selected text model for synthesis, not /research or Cloud deep research.",
        `First use WEB_SEARCH with exactly this query: ${SDK_WEB_RESEARCH_QUERY}`,
        "Then use WEB_FETCH (without extract) to retrieve this exact small primary source. Search output may be capped or opaque; do not claim complete search results or that search found this source:",
        SDK_WEB_RESEARCH_SOURCE,
        "From the fetched source, determine the module-level exported WebSearchMode string values and the optional module-level ThreadOptions member using that type. Return exactly one JSON object with keys values (string array in source declaration order), member (member name without ?), declaration (the exact literal exported WebSearchMode type declaration, including its semicolon), and source (the exact fetched HTTPS URL). Do not answer from memory or fabricate a successful retrieval. If either tool is unavailable or the source cannot be verified, say so instead of guessing.",
        "Use only WEB_SEARCH and WEB_FETCH for research; no delegation, shell, file operations, browser capture or other actions. Do not claim a live search, immutable source revision, or effective model attestation.",
      ].join("\n"),
      checks: [
        {
          id: "original-search-returned-data",
          evaluate: ({ researchGrounding }) =>
            researchGrounding?.searchReturnedData === true,
        },
        {
          id: "original-primary-source-retrieved",
          evaluate: ({ researchGrounding }) =>
            researchGrounding?.primarySourceRetrieved === true,
        },
        {
          id: "literal-answer-agrees-with-retrieval",
          evaluate: ({ researchGrounding }) =>
            researchGrounding?.answerMatchesSource === true,
        },
        {
          id: "citation-agrees-with-retrieval",
          evaluate: ({ researchGrounding }) =>
            researchGrounding?.citationMatches === true,
        },
        {
          id: "original-execution-integrity",
          evaluate: ({ researchGrounding }) =>
            researchGrounding?.executionIntegrity === true,
        },
      ],
      humanReviewRequired: true,
    },
  ],
};

export function findHeadlessEvalSuite(
  suiteId: string,
): HeadlessEvalSuite | undefined {
  return HEADLESS_EVAL_SUITES[suiteId];
}
