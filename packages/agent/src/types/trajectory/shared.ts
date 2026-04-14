export type TrajectoryRole = "user" | "assistant" | "system";

export type TrajectoryMode = "dataset" | "research" | "evaluation" | "rl";

export type TrajectoryGrade = "A" | "B" | "C" | "D" | "F";

export type TrajectoryProvider = "openai" | "anthropic" | "offline";

export interface TrajectoryFilters {
  sessionId?: string;
  role?: TrajectoryRole;
}
