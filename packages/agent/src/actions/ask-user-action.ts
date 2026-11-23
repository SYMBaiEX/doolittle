import type { Action, ActionResult, Memory } from "@elizaos/core";
import { readWorkerBotProfile } from "../runtime/bootstrap/bot-profile";
import { hasGlobalSessionOperatorAccess } from "../runtime/session-operator-policy";
import {
  getScopedTurnMutationObligation,
  getScopedTurnRunId,
  recordScopedTurnActionResult,
} from "../runtime/turn-runtime-scope";
import type { AppServices } from "../services/index";
import type {
  UserInputOption,
  UserInputQuestion,
} from "../services/user-input/types";
import { isRecord } from "../utils/records";

export const DOOLITTLE_ASK_USER_ACTION = "DOOLITTLE_ASK_USER";

const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 4;
const MAX_QUESTION_CHARS = 500;
const MAX_HEADER_CHARS = 80;
const MAX_LABEL_CHARS = 120;
const MAX_DESCRIPTION_CHARS = 240;

function operatorMessage(message: Memory): boolean {
  const metadata = message.metadata as
    | { doolittle?: { source?: unknown } }
    | undefined;
  const source = metadata?.doolittle?.source ?? message.content?.source;
  return typeof source === "string" && hasGlobalSessionOperatorAccess(source);
}

function boundedText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxChars) return undefined;
  return trimmed;
}

function parseOption(value: unknown): UserInputOption | undefined {
  if (!isRecord(value)) return undefined;
  const label = boundedText(value.label, MAX_LABEL_CHARS);
  if (!label) return undefined;
  const description = boundedText(value.description, MAX_DESCRIPTION_CHARS);
  return description ? { label, description } : { label };
}

function parseQuestions(value: unknown): UserInputQuestion[] | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "questions") ||
    !Array.isArray(value.questions) ||
    value.questions.length === 0 ||
    value.questions.length > MAX_QUESTIONS
  )
    return undefined;

  const questions: UserInputQuestion[] = [];
  for (const entry of value.questions) {
    if (!isRecord(entry)) return undefined;
    const question = boundedText(entry.question, MAX_QUESTION_CHARS);
    if (!question) return undefined;
    if (
      entry.options !== undefined &&
      (!Array.isArray(entry.options) ||
        entry.options.length === 0 ||
        entry.options.length > MAX_OPTIONS)
    )
      return undefined;
    const options = (entry.options ?? []).map(parseOption);
    if (options.some((option) => option === undefined)) return undefined;
    const header = boundedText(entry.header, MAX_HEADER_CHARS);
    questions.push({
      question,
      ...(header ? { header } : {}),
      options: options as UserInputOption[],
      multiSelect: entry.multiSelect === true,
    });
  }
  return questions;
}

export function createAskUserAction(services: AppServices): Action {
  return {
    name: DOOLITTLE_ASK_USER_ACTION,
    description: `Ask the user up to ${MAX_QUESTIONS} blocking questions when a decision only they can make stops the requested work. Each question takes ${MAX_OPTIONS} short mutually exclusive options; the user also gets an automatic Other free-text choice and can pick multiple when multiSelect is true. Delivering the questions ends your turn cleanly: finish with a one-line note that you are waiting on the answers, do not repeat the questions, do not guess, and do not keep working blind. Prefer this over prose questions whenever you are blocked on product, scope, or preference decisions.`,
    descriptionCompressed:
      "Deliver blocking questions with selectable options; ends the turn awaiting the user.",
    contexts: ["conversation"],
    validate: async (_runtime, message) => operatorMessage(message),
    parameters: [
      {
        name: "questions",
        required: true,
        description: `One to ${MAX_QUESTIONS} questions for the user, for example [{"header":"Audience","question":"Who should this serve first?","options":[{"label":"Solo builders","description":"Single-agent users"},{"label":"Teams","description":"Multiple managed agents"}],"multiSelect":false}]. Options are optional for open-ended questions.`,
        schema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string", minLength: 1 },
              header: { type: "string" },
              multiSelect: { type: "boolean" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", minLength: 1 },
                    description: { type: "string" },
                  },
                  required: ["label"],
                },
              },
            },
            required: ["question"],
          },
        },
      },
    ],
    handler: async (runtime, message, _state, options) => {
      try {
        if (!operatorMessage(message)) {
          throw new Error(
            "User input requests require a local or authenticated API operator.",
          );
        }
        const questions = parseQuestions(options?.parameters);
        if (!questions) {
          throw new Error(
            `Provide one to ${MAX_QUESTIONS} questions, each with up to ${MAX_OPTIONS} labeled options.`,
          );
        }
        const roomId = String(message.roomId ?? "");
        if (!roomId) {
          throw new Error("User input requests need a conversation room.");
        }
        const metadata = message.metadata as
          | { sessionId?: unknown }
          | undefined;
        const record = services.inputRequests.request({
          roomId,
          userId: String(message.entityId ?? "") || undefined,
          sessionId:
            typeof metadata?.sessionId === "string"
              ? metadata.sessionId
              : roomId,
          runId: getScopedTurnRunId(),
          botId: readWorkerBotProfile()?.id,
          source:
            typeof message.content?.source === "string"
              ? message.content.source
              : undefined,
          mutationObligation: getScopedTurnMutationObligation(runtime) === true,
          questions,
        });
        const actionResult: ActionResult = {
          success: true,
          text: `Questions delivered to the user as input request ${record.id}. The user answers them inline; end this turn now with a short note that you are waiting on their answers. Do not repeat the questions, do not guess, and do not continue the task until the answers arrive.`,
          data: {
            actionName: DOOLITTLE_ASK_USER_ACTION,
            awaitingUserInput: true,
            inputRequestId: record.id,
            questionCount: questions.length,
            suppressVisibleCallback: true,
          },
        };
        recordScopedTurnActionResult(runtime, actionResult);
        return actionResult;
      } catch (error) {
        const actionResult: ActionResult = {
          success: false,
          text: error instanceof Error ? error.message : String(error),
          error: "ASK_USER_FAILED",
          data: { actionName: DOOLITTLE_ASK_USER_ACTION },
        };
        recordScopedTurnActionResult(runtime, actionResult);
        return actionResult;
      }
    },
  };
}
