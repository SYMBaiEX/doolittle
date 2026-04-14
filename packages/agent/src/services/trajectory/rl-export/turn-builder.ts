import type { TrajectoryRecord } from "../../../types/trajectory";
import type { RlTurnBuilderOptions, RlTurnRecord } from "./types";

export function buildRlTurns(
  sessionId: string,
  messages: TrajectoryRecord[],
  options: RlTurnBuilderOptions,
): RlTurnRecord[] {
  const turns: RlTurnRecord[] = [];

  for (let i = 1; i < messages.length; i++) {
    const window = messages.slice(Math.max(0, i - options.windowSize), i);
    const response = messages[i];
    if (!response || response.role !== "assistant") {
      continue;
    }

    turns.push({
      id: `${sessionId}:${i}`,
      sessionId,
      model: options.model ?? "unknown",
      provider: options.provider ?? "unknown",
      agentName: options.agentName ?? "doolittle",
      createdAt: response.createdAt,
      messages: window.map((message) => ({
        role: message.role,
        content: message.text,
      })),
      response: response.text,
      metadata: options.includeMetadata
        ? {
            turnIndex: i,
            windowSize: window.length,
            sessionMessageCount: messages.length,
          }
        : undefined,
    });
  }

  return turns;
}
