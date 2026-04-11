import type { AgentExecutionContext } from "../../chat";
import { parseTrajectoryArgs } from "./shared";

export async function handleTrajectoryAnalyzeCommands(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (
    trimmed === "/trajectories analyze" ||
    trimmed.startsWith("/trajectories analyze ")
  ) {
    const options =
      trimmed === "/trajectories analyze"
        ? { limit: 200 }
        : parseTrajectoryArgs(trimmed.replace("/trajectories analyze ", ""));
    return JSON.stringify(
      context.services.trajectories.analyze({
        ...options,
        limit: options.limit ?? 200,
        mode: options.mode ?? "research",
        purpose: options.purpose ?? "trajectory research",
        tags: options.tags,
        notes: options.notes,
      }),
      null,
      2,
    );
  }

  if (
    trimmed === "/trajectories evaluate" ||
    trimmed.startsWith("/trajectories evaluate ")
  ) {
    const options =
      trimmed === "/trajectories evaluate"
        ? { limit: 200 }
        : parseTrajectoryArgs(trimmed.replace("/trajectories evaluate ", ""));
    return JSON.stringify(
      await context.services.trajectories.evaluate({
        ...options,
        limit: options.limit ?? 200,
        mode: options.mode ?? "evaluation",
        purpose: options.purpose ?? "trajectory evaluation",
        tags: options.tags,
        notes: options.notes,
        rubric: options.rubric,
      }),
      null,
      2,
    );
  }

  if (
    trimmed === "/trajectories package" ||
    trimmed.startsWith("/trajectories package ")
  ) {
    const options =
      trimmed === "/trajectories package"
        ? { limit: 200 }
        : parseTrajectoryArgs(trimmed.replace("/trajectories package ", ""));
    return JSON.stringify(
      await context.services.trajectories.package({
        ...options,
        limit: options.limit ?? 200,
        mode: options.mode ?? "research",
        purpose: options.purpose ?? "trajectory research package",
        tags: options.tags,
        notes: options.notes,
        rubric: options.rubric,
      }),
      null,
      2,
    );
  }

  return undefined;
}
