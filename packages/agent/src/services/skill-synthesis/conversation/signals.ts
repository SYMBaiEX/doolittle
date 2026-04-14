import type { StoredMessage } from "@/types";

export const NOVELTY_SIGNALS = [
  /\b(?:step\s+\d+|first[\s,].*then|finally|workflow|pipeline)\b/iu,
  /\b(?:bash|shell|script|python|typescript|function|class|module)\b/iu,
  /\b(?:success(?:fully)?|complete[d]?|done|finished|solved|fixed)\b/iu,
  /\b(?:turns? out|it seems|found that|discovered|learned|realized)\b/iu,
  /\b(?:repeat|rerun|run\s+again|same\s+approach|similar)\b/iu,
  /\b(?:important|remember|note[: ]|tip[: ]|warning[: ]|pattern)\b/iu,
];

export const TRIVIAL_SIGNALS = [
  /\b(?:what\s+is|what'?s|who\s+is|how\s+do\s+i|can\s+you\s+explain)\b/iu,
  /\b(?:hi|hello|thanks|thank\s+you|goodbye|bye)\b/iu,
];

export const MIN_MESSAGES_FOR_SYNTHESIS = 4;
export const MIN_NOVELTY_SIGNAL_COUNT = 2;

export function isTrivialConversation(messages: StoredMessage[]): boolean {
  const firstUser = messages.find((message) => message.role === "user");
  return Boolean(
    firstUser &&
      TRIVIAL_SIGNALS.some((pattern) => pattern.test(firstUser.text)),
  );
}

export function detectNoveltySignals(fullText: string): string[] {
  const matchedSignals: string[] = [];
  for (const pattern of NOVELTY_SIGNALS) {
    const matches = fullText.match(pattern);
    if (matches) {
      matchedSignals.push(matches[0]);
    }
  }
  return matchedSignals;
}
