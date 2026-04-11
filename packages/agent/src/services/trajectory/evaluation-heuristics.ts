import type {
  TrajectoryExportOptions,
  TrajectoryReplayResult,
} from "../../types/trajectory";

export function normalizeEvaluationMode(
  mode?: "dataset" | "research" | "evaluation" | "rl",
): "research" | "rl" | "evaluation" {
  if (mode === "research" || mode === "rl") {
    return mode;
  }
  return "evaluation";
}

export function buildHighlights(bundle: TrajectoryReplayResult): string[] {
  return [
    `Messages: ${bundle.messageCount}`,
    `Sessions: ${bundle.sessionCount}`,
    `Role counts: ${
      Object.entries(bundle.roleCounts)
        .map(([role, count]) => `${role}=${count}`)
        .join(", ") || "none"
    }`,
    ...(bundle.sessions.length
      ? [`Sessions: ${bundle.sessions.join(", ")}`]
      : ["Sessions: none"]),
  ];
}

export function buildAnalysisPrompt(
  bundle: TrajectoryReplayResult,
  options: TrajectoryExportOptions = {},
): string {
  const preview = bundle.replayPreview
    .map((message) => `[${message.role}] ${message.sessionId}: ${message.text}`)
    .join("\n");

  return [
    "You are reviewing a trajectory bundle for Doolittle and should provide concise, actionable research analysis.",
    "Identify recurring intents, reusable skills, failure modes, and data/replay patterns that could be turned into training or skill synthesis inputs.",
    "Keep the response short and structured: summary, patterns, recommendations.",
    "",
    `Label: ${bundle.label}`,
    `Created: ${bundle.createdAt}`,
    `Mode: ${bundle.mode ?? options.mode ?? "research"}`,
    `Purpose: ${bundle.purpose ?? options.purpose ?? "trajectory research"}`,
    ...(bundle.tags?.length ? [`Tags: ${bundle.tags.join(", ")}`] : []),
    ...(bundle.notes ? [`Notes: ${bundle.notes}`] : []),
    `Messages: ${bundle.messageCount}`,
    `Sessions: ${bundle.sessionCount}`,
    `Filters: session=${bundle.filters?.sessionId ?? "any"}, role=${bundle.filters?.role ?? "any"}`,
    "",
    "Role counts:",
    ...Object.entries(bundle.roleCounts).map(
      ([role, count]) => `- ${role}: ${count}`,
    ),
    "",
    "Sessions:",
    ...(bundle.sessions.length
      ? bundle.sessions.map((sessionId) => `- ${sessionId}`)
      : ["- none"]),
    "",
    "Replay preview:",
    preview.slice(0, 2400) || "(empty)",
  ].join("\n");
}

export function scoreReplay(
  replay: TrajectoryReplayResult,
  rubric: string[],
): {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findings: string[];
  recommendations: string[];
} {
  const findings: string[] = [];
  const recommendations: string[] = [];
  let score = Math.min(50, replay.messageCount * 4);

  if (replay.sessionCount > 1) {
    score += 15;
    findings.push("Multiple sessions are represented in the bundle.");
  } else {
    findings.push("The bundle is concentrated in a single session.");
    recommendations.push(
      "Collect more session diversity for broader training coverage.",
    );
  }

  const roleKinds = Object.keys(replay.roleCounts).length;
  if (roleKinds >= 2) {
    score += 15;
    findings.push("Both user and assistant roles are present in the replay.");
  } else {
    recommendations.push(
      "Include both sides of the conversation for better supervision signal.",
    );
  }

  const averageLength = replay.replayPreview.length
    ? replay.replayPreview.reduce(
        (sum, message) => sum + message.text.length,
        0,
      ) / replay.replayPreview.length
    : 0;
  if (averageLength > 30) {
    score += 10;
  } else {
    recommendations.push(
      "Use fuller message content so the dataset carries clearer task intent.",
    );
  }

  const lowerText = replay.replayPreview
    .map((message) => message.text.toLowerCase())
    .join(" ");
  const rubricHits = rubric.filter(
    (token) => token && lowerText.includes(token.toLowerCase()),
  );
  if (rubricHits.length) {
    score += Math.min(20, rubricHits.length * 5);
    findings.push(`Rubric coverage observed for: ${rubricHits.join(", ")}.`);
  } else if (rubric.length) {
    recommendations.push(
      `Capture scenarios that mention: ${rubric.join(", ")}.`,
    );
  }

  score = Math.max(0, Math.min(100, score));
  const grade: "A" | "B" | "C" | "D" | "F" =
    score >= 90
      ? "A"
      : score >= 80
        ? "B"
        : score >= 70
          ? "C"
          : score >= 60
            ? "D"
            : "F";

  if (!findings.length) {
    findings.push("The replay bundle is structured and readable.");
  }

  return {
    score,
    grade,
    findings,
    recommendations: recommendations.length
      ? recommendations
      : ["No major issues were detected in this replay bundle."],
  };
}
