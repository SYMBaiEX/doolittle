import type { ParsedUserObservation } from "../types";
import { detectTools } from "./tools";

function matchSingle(
  observation: string,
  expression: RegExp,
): string | undefined {
  return observation.match(expression)?.[1]?.trim();
}

export function parseUserObservation(message: string): ParsedUserObservation {
  const observation = message.trim();

  return {
    lower: observation.toLowerCase(),
    preference: matchSingle(
      observation,
      /\b(?:i prefer|i like|i usually use)\s+(.+?)(?:[.!?]|$)/iu,
    ),
    belief: matchSingle(
      observation,
      /\b(?:i believe|i think|i suspect|i'm convinced|i expect)\s+(.+?)(?:[.!?]|$)/iu,
    ),
    fact: matchSingle(
      observation,
      /\b(?:my name is|i am|i'm)\s+(.+?)(?:[.!?]|$)/iu,
    ),
    alias: matchSingle(
      observation,
      /\b(?:you can call me|call me|i go by)\s+(.+?)(?:[.!?]|$)/iu,
    ),
    goal: matchSingle(
      observation,
      /\b(?:my goal is|i want to|i need to|help me)\s+(.+?)(?:[.!?]|$)/iu,
    ),
    projectContext: matchSingle(
      observation,
      /\b(?:we are building|we're building|this project is|the current project is)\s+(.+?)(?:[.!?]|$)/iu,
    ),
    constraint: matchSingle(
      observation,
      /\b(?:do not|don't|must not|cannot|can't)\s+(.+?)(?:[.!?]|$)/iu,
    ),
    workStyle: matchSingle(
      observation,
      /\b(?:i work best with|i prefer updates that are|i want responses that are)\s+(.+?)(?:[.!?]|$)/iu,
    ),
    toolSignals: detectTools(observation),
    relationshipNote:
      /trust|collaborat|team|partner|together|reliable|depend on|count on|follow through/iu.test(
        observation,
      ),
    relationshipSignals: [
      /trust/i.test(observation),
      /work together|collaborat|team|partner|together/i.test(observation),
      /reliable|depend on|count on|follow through/i.test(observation),
    ].filter(Boolean).length,
    isExplicitMemory:
      /remember|save this|important|note that|keep in mind/iu.test(
        observation,
      ) && observation.length < 240,
  };
}
