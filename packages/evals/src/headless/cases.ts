import { readFileSync } from "node:fs";
import { join } from "node:path";

export type HeadlessEvalDomain =
  | "conversation"
  | "coding"
  | "research"
  | "reliability";

export interface HeadlessEvalContext {
  response: string;
  workspaceDir: string;
}

export interface HeadlessEvalCheck {
  id: string;
  evaluate(context: HeadlessEvalContext): boolean;
}

export interface HeadlessEvalTask {
  id: string;
  domain: HeadlessEvalDomain;
  prompt: string;
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

export function findHeadlessEvalSuite(
  suiteId: string,
): HeadlessEvalSuite | undefined {
  return HEADLESS_EVAL_SUITES[suiteId];
}
