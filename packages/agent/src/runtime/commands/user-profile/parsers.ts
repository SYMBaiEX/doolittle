export const USER_REMEMBER_USAGE =
  "Usage: /user remember <preference|fact|belief|goal|context|constraint|relationship|note|memory> :: <text>";

const USER_MEMORY_KIND_VALUES = [
  "preference",
  "fact",
  "belief",
  "goal",
  "context",
  "constraint",
  "relationship",
  "note",
  "memory",
] as const;

export type UserMemoryKind = (typeof USER_MEMORY_KIND_VALUES)[number];

export interface UserModelingSettings {
  userMemoryMode?: "local" | "hybrid";
  assistantMemoryMode?: "local" | "hybrid";
  dialecticMode?: "off" | "assist" | "conclude";
}

export interface AgentSeed {
  name?: string;
  goals?: string[];
  strengths?: string[];
  workStyle?: string[];
  notes?: string[];
}

export const USER_MEMORY_KINDS = new Set<UserMemoryKind>(
  USER_MEMORY_KIND_VALUES,
);

export function isUserMemoryKind(kind: string): kind is UserMemoryKind {
  return USER_MEMORY_KINDS.has(kind as UserMemoryKind);
}

export function parseUserModelingSettings(
  payload: string,
): UserModelingSettings {
  const settings: UserModelingSettings = {};

  const segments = payload
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const segment of segments) {
    const [key, value] = segment.split(":").map((entry) => entry.trim());
    if (!key || !value) {
      continue;
    }
    if (
      (key === "user" || key === "userMemory") &&
      (value === "local" || value === "hybrid")
    ) {
      settings.userMemoryMode = value;
    } else if (
      (key === "assistant" || key === "assistantMemory") &&
      (value === "local" || value === "hybrid")
    ) {
      settings.assistantMemoryMode = value;
    } else if (
      (key === "dialectic" || key === "mode") &&
      (value === "off" || value === "assist" || value === "conclude")
    ) {
      settings.dialecticMode = value;
    }
  }

  return settings;
}

export function parseAgentSeed(raw: string): AgentSeed {
  const seed: AgentSeed = {};

  for (const segment of raw.split("|").map((part) => part.trim())) {
    const [key, value] = segment.split(":").map((part) => part.trim());
    if (!key || !value) {
      continue;
    }
    if (key === "name") {
      seed.name = value;
    } else if (key === "goals" || key === "goal") {
      seed.goals = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (key === "strengths" || key === "strength") {
      seed.strengths = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (key === "style" || key === "workStyle") {
      seed.workStyle = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (key === "notes" || key === "note") {
      seed.notes = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return seed;
}
