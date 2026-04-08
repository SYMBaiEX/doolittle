import type { StoredMessage } from "@/types";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(messages: StoredMessage[]): number {
  return messages.reduce(
    (sum, message) =>
      sum + estimateTokens(`[${message.role}] ${message.text}`) + 8,
    0,
  );
}
