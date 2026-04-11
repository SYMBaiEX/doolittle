import type { AgentExecutionContext } from "../../chat";
import { parseTrajectoryArgs } from "./shared";

export async function handleTrajectoryBatchCommands(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed.startsWith("/trajectories batch ")) {
    const payload = trimmed.replace("/trajectories batch ", "");
    const [optionsRaw, promptsRaw] = payload
      .split("::")
      .map((part) => part.trim());
    const options = parseTrajectoryArgs(optionsRaw);
    const prompts = (promptsRaw ?? "")
      .split("=>")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!prompts.length) {
      return "Usage: /trajectories batch label:<name> rubric:a,b :: prompt one => prompt two";
    }

    const label = options.label ?? `trajectory-batch-${Date.now()}`;
    const group = `trajectory-batch:${label}`;
    const tasks = prompts.map((prompt, index) =>
      context.services.delegation.create({
        title: `Batch prompt ${index + 1}`,
        objective: prompt,
        group,
        profile: "research",
        priority: "normal",
        labels: ["trajectory", "batch"],
        metadata: {
          source: "trajectory-batch",
          label,
        },
        executionMode: "local",
      }),
    );

    return JSON.stringify(
      {
        batch: context.services.trajectories.createBatchManifest({
          label,
          purpose: options.purpose ?? "trajectory batch",
          prompts,
          rubric: options.rubric,
          tags: options.tags,
          taskIds: tasks.map((task) => task.id),
          group,
        }),
        tasks,
      },
      null,
      2,
    );
  }

  return undefined;
}
