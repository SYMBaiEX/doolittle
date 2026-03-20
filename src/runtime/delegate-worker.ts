import { readFileSync, writeFileSync } from "node:fs";
import { getAppContext } from "./bootstrap";
import { handleAgentTurn } from "./chat";

interface WorkerPayload {
  taskId: string;
  objective: string;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  parentTaskId?: string;
}

const [, , inputPath, outputPath] = process.argv;
const startedAt = new Date().toISOString();

if (!inputPath || !outputPath) {
  console.error(
    "Usage: bun run src/runtime/delegate-worker.ts <input-path> <output-path>",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const payload = JSON.parse(readFileSync(inputPath, "utf8")) as WorkerPayload;
  const context = await getAppContext();
  const result = await handleAgentTurn(
    {
      message: [
        payload.group ? `Group: ${payload.group}` : "",
        payload.profile ? `Delegation profile: ${payload.profile}` : "",
        payload.priority ? `Priority: ${payload.priority}` : "",
        payload.tags?.length ? `Tags: ${payload.tags.join(", ")}` : "",
        payload.labels?.length ? `Labels: ${payload.labels.join(", ")}` : "",
        payload.parentTaskId ? `Parent task: ${payload.parentTaskId}` : "",
        payload.metadata && Object.keys(payload.metadata).length
          ? `Metadata: ${Object.entries(payload.metadata)
              .map(([key, value]) => `${key}=${value}`)
              .join(", ")}`
          : "",
        payload.objective,
      ]
        .filter(Boolean)
        .join("\n"),
      userId: `delegate:${payload.taskId}`,
      roomId: `delegate:${payload.taskId}`,
      source: "delegate-worker",
    },
    context,
  );

  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        ok: true,
        taskId: payload.taskId,
        workerPid: process.pid,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - Date.parse(startedAt),
        output: result,
      },
      null,
      2,
    ),
    "utf8",
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        ok: false,
        workerPid: process.pid,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - Date.parse(startedAt),
        error: message,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.error(message);
  process.exit(1);
});
