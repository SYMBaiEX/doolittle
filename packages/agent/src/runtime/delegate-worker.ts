import { readFileSync, writeFileSync } from "node:fs";
import { getEntrypointLogger } from "@/logging/entrypoint-logger";
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
const fallbackLogger = getEntrypointLogger("delegate-worker");

if (!inputPath || !outputPath) {
  fallbackLogger.error("delegate-worker-usage", {
    argv: process.argv.slice(2),
  });
  process.stderr.write(
    "Usage: bun run packages/agent/src/runtime/delegate-worker.ts <input-path> <output-path>\n",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const payload = JSON.parse(readFileSync(inputPath, "utf8")) as WorkerPayload;
  const context = await getAppContext();
  const logger = context.services.logger
    .child("runtime.delegate-worker")
    .withFields({
      taskId: payload.taskId,
      workerPid: process.pid,
    });
  logger.info("delegate-worker-started", {
    profile: payload.profile,
    priority: payload.priority,
    group: payload.group,
  });
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
  logger.info("delegate-worker-completed", {
    durationMs: Date.now() - Date.parse(startedAt),
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  fallbackLogger.captureError("delegate-worker-failed", error, {
    workerPid: process.pid,
    inputPath,
    outputPath,
  });
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
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
