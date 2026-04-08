import type { AgentIdentityRecord, UserProfileRecord } from "@/types";

export interface ParsedUserObservation {
  lower: string;
  preference?: string;
  belief?: string;
  fact?: string;
  alias?: string;
  goal?: string;
  projectContext?: string;
  constraint?: string;
  workStyle?: string;
  toolSignals: string[];
  relationshipNote: boolean;
  relationshipSignals: number;
  isExplicitMemory: boolean;
}

export interface ParsedAgentObservation {
  goal?: string;
  strength?: string;
  workStyle?: string;
}

export interface UserProfileObservationHost {
  nowIso(): string;
  unique(items: string[]): string[];
  normalizeRelationship(
    relationship?: UserProfileRecord["relationship"],
  ): NonNullable<UserProfileRecord["relationship"]>;
}

function matchSingle(
  observation: string,
  expression: RegExp,
): string | undefined {
  return observation.match(expression)?.[1]?.trim();
}

function detectTools(observation: string): string[] {
  const known = [
    "Bun",
    "Docker",
    "Podman",
    "SSH",
    "Lightpanda",
    "Claude",
    "OpenAI",
    "Anthropic",
    "Telegram",
    "Discord",
    "Slack",
    "WhatsApp",
    "Matrix",
    "Signal",
    "Mattermost",
    "Home Assistant",
    "DingTalk",
  ];
  const lower = observation.toLowerCase();
  return known.filter((tool) => lower.includes(tool.toLowerCase()));
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

export const extractUserObservationSignals = parseUserObservation;
export const extractAgentObservationSignals = parseAgentObservation;

export function applyUserObservationSignals(
  host: UserProfileObservationHost,
  profile: UserProfileRecord,
  observation: string,
  source?: string,
): void {
  const signals = parseUserObservation(observation);

  if (signals.preference && signals.preference.length < 160) {
    profile.preferences = host.unique([
      ...profile.preferences,
      signals.preference,
    ]);
  }
  if (signals.belief && signals.belief.length < 180) {
    profile.beliefs = host.unique([...profile.beliefs, signals.belief]);
    profile.beliefSources = host.unique([
      ...(profile.beliefSources ?? []),
      source ?? "observation",
    ]);
  }
  if (signals.fact && signals.fact.length < 160) {
    if (signals.lower.startsWith("my name is")) {
      profile.displayName = signals.fact.trim();
    } else {
      profile.facts = host.unique([...profile.facts, signals.fact]);
    }
  }
  if (signals.alias && signals.alias.length < 100) {
    profile.aliases = host.unique([...(profile.aliases ?? []), signals.alias]);
  }
  if (signals.goal && signals.goal.length < 180) {
    profile.goals = host.unique([...(profile.goals ?? []), signals.goal]);
  }
  if (signals.projectContext && signals.projectContext.length < 220) {
    profile.projectContext = host.unique([
      ...(profile.projectContext ?? []),
      signals.projectContext,
    ]);
  }
  if (signals.constraint && signals.constraint.length < 220) {
    profile.constraints = host.unique([
      ...(profile.constraints ?? []),
      signals.constraint,
    ]);
  }
  if (signals.toolSignals.length) {
    profile.toolPreferences = host.unique([
      ...(profile.toolPreferences ?? []),
      ...signals.toolSignals,
    ]);
  }
  if (signals.relationshipNote) {
    const current = host.normalizeRelationship(profile.relationship);
    current.notes = host
      .unique([...(current.notes ?? []), observation])
      .slice(-15);
    current.lastInteractionAt = host.nowIso();
    current.lastSource = source ?? current.lastSource;
    profile.relationship = host.normalizeRelationship(current);
  }
  if (signals.workStyle && signals.workStyle.length < 180) {
    profile.workStyle = host.unique([
      ...(profile.workStyle ?? []),
      signals.workStyle,
    ]);
  }
  if (signals.isExplicitMemory) {
    profile.explicitMemories = host.unique([
      ...(profile.explicitMemories ?? []),
      observation,
    ]);
  }
  if (signals.relationshipSignals > 0) {
    const current = host.normalizeRelationship(profile.relationship);
    current.trust = Math.min(
      10,
      current.trust + (signals.relationshipSignals > 1 ? 2 : 1),
    );
    current.collaboration = Math.min(
      10,
      current.collaboration + (signals.relationshipSignals > 1 ? 2 : 1),
    );
    current.notes = host
      .unique([...(current.notes ?? []), observation])
      .slice(-15);
    current.lastInteractionAt = host.nowIso();
    current.lastSource = source ?? current.lastSource;
    profile.relationship = host.normalizeRelationship(current);
  }

  profile.lastSource = source ?? profile.lastSource;
}

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
