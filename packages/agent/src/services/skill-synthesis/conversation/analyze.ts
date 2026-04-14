import type { StoredMessage } from "@/types";

import { inferCategory } from "./category";
import {
  detectNoveltySignals,
  isTrivialConversation,
  MIN_MESSAGES_FOR_SYNTHESIS,
  MIN_NOVELTY_SIGNAL_COUNT,
} from "./signals";
import { extractStepsFromMessages } from "./step-extractor";
import type { ConversationAnalysisResult } from "./types";
import { buildSlug } from "./utils";

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

  if (isTrivialConversation(messages)) {
    return { shouldSynthesize: false, reason: "Appears to be a simple Q&A" };
  }

  const matchedSignals = detectNoveltySignals(fullText);
  if (matchedSignals.length < MIN_NOVELTY_SIGNAL_COUNT) {
    return {
      shouldSynthesize: false,
      reason: `Only ${matchedSignals.length} novelty signal(s) detected (minimum ${MIN_NOVELTY_SIGNAL_COUNT})`,
    };
  }

  const firstUser = messages.find((message) => message.role === "user");
  const rawTitle =
    firstUser?.text.split("\n")[0]?.slice(0, 80).trim() ?? "Learned Workflow";
  const title = rawTitle.replace(/[^\w\s-]/g, "").trim() || "Learned Workflow";
  const slug = buildSlug(title);

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
