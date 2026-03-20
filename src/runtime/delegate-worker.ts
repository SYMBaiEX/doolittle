import { readFileSync, writeFileSync } from "node:fs";
import { getAppContext } from "./bootstrap";
import { handleAgentTurn } from "./chat";

interface WorkerPayload {
  taskId: string;
  objective: string;
}

const [, , inputPath, outputPath] = process.argv;
const startedAt = new Date().toISOString();

if (!inputPath || !outputPath) {
  console.error("Usage: bun run src/runtime/delegate-worker.ts <input-path> <output-path>");
  process.exit(1);
}

async function main(): Promise<void> {
  const payload = JSON.parse(readFileSync(inputPath, "utf8")) as WorkerPayload;
  const context = await getAppContext();
  const result = await handleAgentTurn(
    {
      message: payload.objective,
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
