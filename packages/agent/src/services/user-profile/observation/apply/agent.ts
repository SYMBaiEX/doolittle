import type { AgentIdentityRecord } from "@/types";
import { parseAgentObservation } from "../parsing/agent";
import type { UserProfileObservationHost } from "../types";

export function applyAgentObservationSignals(
  host: Pick<UserProfileObservationHost, "unique">,
  agent: AgentIdentityRecord,
  observation: string,
  source?: string,
): void {
  const signals = parseAgentObservation(observation);

  if (signals.goal) {
    agent.goals = host.unique([...agent.goals, signals.goal]);
  } else if (signals.strength) {
    agent.strengths = host.unique([...agent.strengths, signals.strength]);
  } else if (signals.workStyle) {
    agent.workStyle = host.unique([...agent.workStyle, signals.workStyle]);
  } else {
    agent.notes = host.unique([...agent.notes, observation]);
  }
  agent.lastSource = source ?? agent.lastSource;
}
