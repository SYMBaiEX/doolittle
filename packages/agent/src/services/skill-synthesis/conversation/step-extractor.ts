import type { StoredMessage } from "@/types";

export function extractStepsFromMessages(messages: StoredMessage[]): string[] {
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
