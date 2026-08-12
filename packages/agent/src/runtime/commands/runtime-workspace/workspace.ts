import { createEffectiveDelegationTask } from "@/runtime/native/service-bridge/delegation";
import { getEffectiveMemorySnapshot } from "@/runtime/native/service-bridge/ownership";
import {
  getNativeWorkspaceSummary,
  readNativeWorkspaceFile,
  searchNativeWorkspace,
  writeNativeWorkspaceFile,
} from "@/runtime/native/service-bridge/tooling";
import type { MemoryTarget } from "@/types/runtime";
import { formatMemorySummary } from "../runtime-status-formatters";
import {
  executeMemoryCommandOperation,
  parseMemoryCommand,
} from "./memory-operations";
import type { RuntimeWorkspaceCommandHandler } from "./types";

export const handleRuntimeWorkspaceIoCommand: RuntimeWorkspaceCommandHandler =
  async (input, trimmed, context) => {
    if (trimmed.startsWith("/memory")) {
      const target: MemoryTarget =
        trimmed.includes(" user ") || trimmed.endsWith(" user")
          ? "user"
          : "memory";
      if (
        trimmed === "/memory summary" ||
        trimmed === `/memory summary ${target}`
      ) {
        return JSON.stringify(
          getEffectiveMemorySnapshot(context.runtime, context.services, target),
          null,
          2,
        );
      }
      if (
        trimmed === "/memory" ||
        trimmed === "/memory list" ||
        trimmed === `/memory list ${target}`
      ) {
        return [
          context.services.memory.renderSnapshot(target, input.userId),
          "",
          `Summary: ${formatMemorySummary(
            getEffectiveMemorySnapshot(
              context.runtime,
              context.services,
              target,
              input.userId,
            ),
          )}`,
        ].join("\n");
      }
      const operation = parseMemoryCommand(trimmed);
      if (operation && operation.action !== "list") {
        return executeMemoryCommandOperation(
          context.services,
          operation,
          input.userId,
        );
      }
    }

    if (trimmed.startsWith("/queue ")) {
      const objective = trimmed.replace("/queue ", "").trim();
      if (!objective) {
        return "Usage: /queue <prompt>";
      }
      return JSON.stringify(
        await createEffectiveDelegationTask(
          context.runtime,
          context.services.delegationProjection,
          {
            title: `Queued prompt ${new Date().toISOString()}`,
            objective,
            group: "queued-prompts",
            profile: "queued",
            priority: "normal",
            labels: ["queue", "prompt"],
            metadata: {
              source: input.source ?? "cli",
              userId: input.userId,
              roomId: input.roomId ?? `room:${input.userId}`,
            },
            executionMode: "local",
          },
        ),
        null,
        2,
      );
    }

    if (trimmed === "/context" || trimmed === "/context files") {
      return context.services.contextFiles.render();
    }

    if (trimmed === "/workspace" || trimmed === "/workspace tree") {
      return await getNativeWorkspaceSummary(context.runtime, 40);
    }

    if (trimmed.startsWith("/workspace read ")) {
      const path = trimmed.replace("/workspace read ", "").trim();
      return String(readNativeWorkspaceFile(context.runtime, path));
    }

    if (trimmed.startsWith("/workspace search ")) {
      const query = trimmed.replace("/workspace search ", "").trim();
      const results = (await searchNativeWorkspace(
        context.runtime,
        query,
        20,
      )) as Array<{
        path: string;
        matches: string[];
      }>;
      return results.length
        ? results
            .map(
              (result) =>
                `${result.path}\n${result.matches.map((line) => `  ${line}`).join("\n")}`,
            )
            .join("\n\n")
        : "No workspace matches found.";
    }

    if (trimmed.startsWith("/workspace write ")) {
      const payload = trimmed.replace("/workspace write ", "");
      const [path, ...contentParts] = payload.split("::");
      const relativePath = path?.trim();
      const content = contentParts.join("::").trim();
      if (!relativePath || !content) {
        return "Usage: /workspace write <path> :: <content>";
      }
      const writtenPath = await writeNativeWorkspaceFile(
        context.runtime,
        relativePath,
        content,
      );
      return `Wrote ${writtenPath}.`;
    }

    return undefined;
  };
