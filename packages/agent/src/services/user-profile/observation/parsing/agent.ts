import type { ParsedAgentObservation } from "../types";

function matchSingle(
  observation: string,
  expression: RegExp,
): string | undefined {
  return observation.match(expression)?.[1]?.trim();
}

export function parseAgentObservation(message: string): ParsedAgentObservation {
  const observation = message.trim();
  return {
    goal: matchSingle(
      observation,
      /\b(?:goal|objective|mission)\s*:\s*(.+)$/iu,
    ),
    strength: matchSingle(
      observation,
      /\b(?:strength|specialty|best at)\s*:\s*(.+)$/iu,
    ),
    workStyle: matchSingle(
      observation,
      /\b(?:style|work style|voice)\s*:\s*(.+)$/iu,
    ),
  };
}
