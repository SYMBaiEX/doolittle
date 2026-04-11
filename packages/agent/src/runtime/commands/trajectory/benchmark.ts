import type { AgentExecutionContext } from "../../chat";
import { parseTrajectoryArgs, parseTrajectoryBenchmarkCases } from "./shared";

export async function handleTrajectoryBenchmarkCommands(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (
    trimmed === "/trajectories benchmark environment" ||
    trimmed === "/trajectories benchmarks environment"
  ) {
    return JSON.stringify(
      context.services.trajectories.describeBenchmarkEnvironment(),
      null,
      2,
    );
  }

  if (
    trimmed === "/trajectories benchmark list" ||
    trimmed === "/trajectories benchmarks"
  ) {
    const manifests = context.services.trajectories.listBenchmarkManifests(10);
    return manifests.length
      ? manifests
          .map(
            (entry) =>
              `- ${entry.label} [${entry.createdAt}] cases=${entry.cases.length} group=${entry.group}\n  manifest=${entry.manifestPath}`,
          )
          .join("\n\n")
      : "No trajectory benchmark manifests recorded.";
  }

  if (trimmed.startsWith("/trajectories benchmark create ")) {
    const payload = trimmed.replace("/trajectories benchmark create ", "");
    const [optionsRaw, casesRaw] = payload
      .split("::")
      .map((part) => part.trim());
    const options = parseTrajectoryArgs(optionsRaw ?? "");
    const cases = parseTrajectoryBenchmarkCases(casesRaw ?? "");
    if (!cases.length) {
      return "Usage: /trajectories benchmark create label:<name> rubric:a,b :: label:baseline => label:target";
    }
    return JSON.stringify(
      context.services.trajectories.createBenchmarkManifest({
        label: options.label,
        purpose: options.purpose,
        tags: options.tags,
        rubric: options.rubric,
        group: options.notes,
        cases,
      }),
      null,
      2,
    );
  }

  if (trimmed === "/trajectories benchmark run latest") {
    const run = await context.services.trajectories.runLatestBenchmark();
    return run
      ? JSON.stringify(run, null, 2)
      : "No trajectory benchmark manifests recorded.";
  }

  if (trimmed.startsWith("/trajectories benchmark run ")) {
    const raw = trimmed.replace("/trajectories benchmark run ", "").trim();
    if (!raw) {
      return "Usage: /trajectories benchmark run <manifest-path|label|latest>";
    }
    if (raw === "latest") {
      const run = await context.services.trajectories.runLatestBenchmark();
      return run
        ? JSON.stringify(run, null, 2)
        : "No trajectory benchmark manifests recorded.";
    }
    const manifests = context.services.trajectories.listBenchmarkManifests(50);
    const resolved = raw.endsWith(".json")
      ? raw
      : manifests.find(
          (entry) => entry.label === raw || entry.manifestPath.endsWith(raw),
        )?.manifestPath;
    if (!resolved) {
      return `Trajectory benchmark manifest not found: ${raw}`;
    }
    return JSON.stringify(
      await context.services.trajectories.runBenchmark(resolved),
      null,
      2,
    );
  }

  return undefined;
}
