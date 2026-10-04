import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CODING_VERIFICATION_COMMAND,
  CODING_VERIFICATION_SUCCESS_MARKER,
  type CodingVerification,
} from "./coding-verification";
import {
  fixtureScopePreserved,
  type HeadlessFixture,
  type HeadlessFixtureStrategy,
  readFixtureArtifact,
  runFixtureRegression,
} from "./fixtures";
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
  /** Required original CLI-stream receipt only for the coding verifier task. */
  codingVerification?: CodingVerification;
  /** A harness-created opaque fixture handle, never incoming file content. */
  fixture?: HeadlessFixture;
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
  /** Selects a fixed original-action grounding protocol. */
  groundingStrategy?: "sdk-web-source-v1" | "coding-original-verifier-v1";
  fixtureStrategy?: HeadlessFixtureStrategy;
  /** Local synthetic research never opts into configured Cloud credentials. */
  researchMode?: "local";
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

function expectedCodingFinalJson(response: string, verified: boolean): boolean {
  const expected = verified
    ? CODING_VERIFICATION_SUCCESS_MARKER
    : '{"file":"math.mjs","tests":"unverified"}';
  return response === expected;
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

const v6Suite = HEADLESS_EVAL_SUITES["headless-workflows-v6"];
HEADLESS_EVAL_SUITES["headless-workflows-v7"] = {
  id: v6Suite.id,
  version: 7,
  title: "Expanded baseline with original-action coding verification evidence",
  tasks: v6Suite.tasks.map((task) =>
    task.id === "coding-function-behavior-v6"
      ? {
          id: "coding-original-verifier-v1",
          domain: "coding",
          groundingStrategy: "coding-original-verifier-v1",
          prompt: [
            "In the current Doolittle workspace only, create math.mjs exporting a named function sumFinite(values). It returns the sum of finite numeric array entries, ignores strings and non-finite numbers, and returns 0 for an empty array. Preserve the exact v6 behavioral expectations: [1, 2.5, '3', NaN, Infinity, -4] gives -0.5; [] gives 0; [1, '2', 2] gives 3.",
            "Do not create or edit any other task file. The ACP session may add AGENTS.md and CLAUDE.md as harness identity files; leave them untouched.",
            "Run this exact public SHELL command in the original parent CLI turn after creating math.mjs. Do not delegate the verifier to a worker, subagent, ACP session, or other CLI run:",
            CODING_VERIFICATION_COMMAND,
            'On verifier success, the final response must be exactly its success JSON body with no code fence or added text: {"file":"math.mjs","tests":"passed"}. Otherwise return exactly {"file":"math.mjs","tests":"unverified"} with no other text. Do not claim verification based on a worker, your response, or another command.',
          ].join("\n"),
          checks: [
            {
              id: "sum-finite-behavior",
              evaluate: ({ workspaceDir }: HeadlessEvalContext) => {
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
            },
            {
              id: "original-verifier-action-succeeded",
              evaluate: ({ codingVerification }) =>
                codingVerification?.status === "verified",
            },
            {
              id: "final-json-matches-verifier-receipt",
              evaluate: ({ response, codingVerification }) =>
                expectedCodingFinalJson(
                  response,
                  codingVerification?.status === "verified",
                ),
            },
          ],
          humanReviewRequired: true,
        }
      : { ...task, id: task.id.replace(/-v6$/u, "-v7") },
  ),
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

function exactJson(response: string | undefined, expected: unknown): boolean {
  if (response === undefined) return false;
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object")
      return `{${Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
        .join(",")}}`;
    return JSON.stringify(value);
  };
  try {
    return canonical(JSON.parse(response)) === canonical(expected);
  } catch {
    return false;
  }
}

const handoff = {
  project: "Harbor",
  owner: "Jules",
  releaseDay: "Thursday",
  maxP95Ms: 75,
  addDependencies: false,
  implementationRequested: false,
  externalMessagesRequested: false,
  rollbackTrigger: "duplicate charge",
  releaseTimezone: null,
  rollbackOwner: null,
};
const reconciliation = {
  capacity: 40,
  launchRequiresSafetyReview: true,
  pilotStartDate: null,
  authority: "launch-policy.md",
  authorityDate: "2026-09-12",
  conflictingSource: "planning-note.md",
  conflictingDate: "2026-10-01",
  citations: [
    { file: "launch-policy.md", quote: "Pilot capacity is 40 accounts." },
    {
      file: "launch-policy.md",
      quote: "Pilot runs stay disabled until safety review approves.",
    },
    {
      file: "planning-note.md",
      quote: "We propose 80 pilot accounts and launch before safety review.",
    },
  ],
  unavailableFact: "pilot start date",
};
const fallbackStatus = {
  primary: "unavailable",
  source: "fallback-status.json",
  service: "Harbor",
  status: "degraded",
  reason: "maintenance",
  externalEffects: "not-requested",
};
function codingRepresentativeFinal(response: string): boolean {
  try {
    const value = JSON.parse(response);
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join(",") ===
        "agentVerification,file,limitations,summary" &&
      value.file === "totals.mjs" &&
      value.agentVerification === "UNATTESTED" &&
      [value.summary, value.limitations].every(
        (text) =>
          typeof text === "string" &&
          text.trim().length > 0 &&
          text.length <= 500,
      )
    );
  } catch {
    return false;
  }
}

HEADLESS_EVAL_SUITES["headless-representative-v1"] = {
  id: "headless-representative",
  version: 1,
  title:
    "Representative handoff, seeded regression, local reconciliation, fallback, and original SDK retrieval",
  tasks: [
    {
      id: "conversation-project-handoff-v1",
      domain: "conversation",
      prompt:
        "We are preparing the Harbor invoice-queue handoff, not implementing it. Maya owns the release planned for Wednesday. Keep p95 queue latency at or below 75 ms, add no dependencies, and roll back if a duplicate charge occurs. Do not use tools, edit files, send messages, or schedule anything. The release timezone and rollback owner are not yet assigned; do not invent them. Give a brief handoff summary and identify those two unresolved details.",
      followUpPrompts: [
        "Correction: Jules owns this release, not Maya, and the release day is Thursday, not Wednesday. All other constraints remain in force. Briefly update the handoff, retaining the unresolved details. Still no tools or implementation.",
        "Prepare the final machine-readable handoff only. Return exactly one JSON object, no markdown or extra keys: project (string), owner (string), releaseDay (string), maxP95Ms (number), addDependencies (boolean), implementationRequested (boolean), externalMessagesRequested (boolean), rollbackTrigger (string), releaseTimezone (string or null), rollbackOwner (string or null). Use the corrected facts and retained constraints; unknown fields must be null.",
      ],
      checks: [
        {
          id: "complete-three-turn-exchange",
          evaluate: ({ responses }) =>
            responses.length === 3 &&
            responses.every((response) => response.trim().length > 0),
        },
        {
          id: "retains-constraints-and-corrected-facts",
          evaluate: ({ response }) => exactJson(response, handoff),
        },
        {
          id: "no-recorded-actions",
          evaluate: ({ actionStarts }) => actionStarts === 0,
        },
      ],
      humanReviewRequired: true,
    },
    {
      id: "coding-seeded-invoice-regression-v1",
      domain: "coding",
      fixtureStrategy: "invoice-regression-v1",
      prompt:
        'Fix the seeded invoice regression in this workspace. Read README.md, totals.mjs, amount.mjs, and totals.test.mjs. Only totals.mjs may change; preserve the imported helper, regression tests, README, and harness identity files. Keep file permissions owner-only (0600). totalApproved must sum only approved finite nonnegative numeric amounts, ignore invalid entries including null, round the final sum to cents, and never mutate input. Use the existing helper; no dependencies, extra files, or external effects. Run the preserved regression command from README if available. The harness independently executes those preserved tests; it does NOT attest your own test execution. Final reply must be one strict JSON object with exactly four keys: file="totals.mjs", agentVerification="UNATTESTED", summary (a nonempty explanation of your fix, at most 500 characters), limitations (a nonempty honest limitations statement, at most 500 characters). No added text or invented verification claim. The human reviewer assesses your explanation; no lexical test words prove execution.',
      checks: [
        {
          id: "fixture-scope-preserved",
          evaluate: ({ fixture }) => fixtureScopePreserved(fixture),
        },
        {
          id: "preserved-regression-passes",
          evaluate: ({ fixture }) => runFixtureRegression(fixture),
        },
        {
          id: "final-contract-unattested",
          evaluate: ({ response }) => codingRepresentativeFinal(response),
        },
      ],
      humanReviewRequired: true,
    },
    {
      id: "research-local-reconciliation-v1",
      domain: "research",
      researchMode: "local",
      fixtureStrategy: "local-reconciliation-v1",
      prompt:
        'This is synthetic local research, not /research, Cloud research, or a web request. Reconcile launch-policy.md (approved policy) with planning-note.md (newer nonbinding proposal). Authority overrides recency; explicitly expose their conflicting capacities and launch requirements. Do not modify sources or identity files, use external tools, or invent the unavailable pilot start date. Create only reconciliation.json as a private owner-only regular file (permissions 0600), a strict JSON object with keys capacity (number), launchRequiresSafetyReview (boolean), pilotStartDate (string or null), authority (file name), authorityDate (ISO date), conflictingSource (file name), conflictingDate (ISO date), citations (three objects in this order: approved capacity, approved review requirement, conflicting proposal; each has file and exact quote), unavailableFact (string naming the unavailable fact). The artifact contract is graded, not original read-action proof. Final reply must be the same complete reconciliation object plus the key readProof="UNATTESTED", with no markdown or extra keys, so human review can inspect the claims, citations, and uncertainty.',
      checks: [
        {
          id: "fixture-scope-preserved",
          evaluate: ({ fixture }) => fixtureScopePreserved(fixture),
        },
        {
          id: "reconciliation-artifact-exact",
          evaluate: ({ fixture }) =>
            exactJson(readFixtureArtifact(fixture), reconciliation),
        },
        {
          id: "final-contract-unattested",
          evaluate: ({ response, fixture }) =>
            exactJson(response, {
              ...reconciliation,
              readProof: "UNATTESTED",
            }) && exactJson(readFixtureArtifact(fixture), reconciliation),
        },
      ],
      humanReviewRequired: true,
    },
    {
      id: "reliability-local-fallback-v1",
      domain: "reliability",
      fixtureStrategy: "local-fallback-v1",
      prompt:
        'Perform this contained local tool task. The requested primary-status.json input is unavailable; use the existing fallback-status.json to recover the service status, preserving all seed inputs and identity files. Do not create primary-status.json. Create only status.json as a private owner-only regular file (permissions 0600) with exactly these keys: primary ("unavailable"), source (fallback file name), service, status, reason (from fallback), externalEffects ("not-requested"). No web, external tools, messages, sends, deployments, or other effects are requested. Final reply must be the same complete status object plus artifact="status.json", without markdown or extra keys, so a human can inspect the fallback outcome. The grader checks the final artifact and at least one recorded action; this is not proof of read ordering, a failed primary attempt, fallback causality, or absence of all external effects.',
      checks: [
        {
          id: "fixture-scope-preserved",
          evaluate: ({ fixture }) => fixtureScopePreserved(fixture),
        },
        {
          id: "fallback-status-artifact-exact",
          evaluate: ({ fixture }) =>
            exactJson(readFixtureArtifact(fixture), fallbackStatus),
        },
        {
          id: "recorded-action-started",
          evaluate: ({ actionStarts }) =>
            actionStarts !== null && actionStarts > 0,
        },
        {
          id: "final-artifact-contract",
          evaluate: ({ response }) =>
            exactJson(response, { ...fallbackStatus, artifact: "status.json" }),
        },
      ],
      humanReviewRequired: true,
    },
    HEADLESS_EVAL_SUITES["headless-sdk-web-research-v1"].tasks[0],
  ],
};

const representativeV1 = HEADLESS_EVAL_SUITES["headless-representative-v1"];
const handoffV1 = representativeV1.tasks[0];
HEADLESS_EVAL_SUITES["headless-representative-v2"] = {
  ...representativeV1,
  version: 2,
  tasks: [
    {
      ...handoffV1,
      id: "conversation-project-handoff-v2",
      followUpPrompts: handoffV1.followUpPrompts?.map((prompt, index) =>
        index === 1
          ? `${prompt} Use the exact JSON string literals project="Harbor" and rollbackTrigger="duplicate charge".`
          : prompt,
      ),
    },
    ...representativeV1.tasks.slice(1),
  ],
};

const representativeV2 = HEADLESS_EVAL_SUITES["headless-representative-v2"];
const reconciliationV1 = representativeV2.tasks[2];
HEADLESS_EVAL_SUITES["headless-representative-v3"] = {
  ...representativeV2,
  version: 3,
  tasks: representativeV2.tasks.map((task, index) =>
    index === 2
      ? {
          ...reconciliationV1,
          id: "research-local-reconciliation-v2",
          prompt: `${reconciliationV1.prompt} In both the artifact and final reply, use the exact JSON literals pilotStartDate=null and unavailableFact="pilot start date".`,
        }
      : task,
  ),
};

export function findHeadlessEvalSuite(
  suiteId: string,
): HeadlessEvalSuite | undefined {
  return HEADLESS_EVAL_SUITES[suiteId];
}
