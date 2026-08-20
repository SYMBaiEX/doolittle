export interface ReviewWorkStateInput {
  failingChecks: number;
  pendingApprovals: number;
  changedFiles: number;
  agentRuns: number;
}

export interface ReviewWorkState {
  tone: "bad" | "warn" | "good" | "neutral";
  icon: "attention" | "waiting" | "ready" | "empty";
  title: string;
  detail: string;
}

export function reviewWorkState({
  failingChecks,
  pendingApprovals,
  changedFiles,
  agentRuns,
}: ReviewWorkStateInput): ReviewWorkState {
  if (failingChecks > 0) {
    return {
      tone: "bad",
      icon: "attention",
      title: "Needs attention",
      detail: `${failingChecks} verification ${
        failingChecks === 1 ? "check is" : "checks are"
      } failing before this work is ready.`,
    };
  }

  if (pendingApprovals > 0) {
    return {
      tone: "warn",
      icon: "waiting",
      title: "Waiting on your decision",
      detail: `${pendingApprovals} ${
        pendingApprovals === 1 ? "approval needs" : "approvals need"
      } your decision before the agent can continue.`,
    };
  }

  if (changedFiles > 0 || agentRuns > 0) {
    const completedWork =
      agentRuns > 0
        ? `${agentRuns} agent ${agentRuns === 1 ? "run" : "runs"}`
        : "the latest work";
    return {
      tone: "good",
      icon: "ready",
      title: "Ready for your review",
      detail: `Doolittle completed ${completedWork} with ${changedFiles} changed ${
        changedFiles === 1 ? "file" : "files"
      }.`,
    };
  }

  return {
    tone: "neutral",
    icon: "empty",
    title: "No completed work yet",
    detail:
      "Completed agent runs, changed files, checks, and decisions will collect here.",
  };
}
