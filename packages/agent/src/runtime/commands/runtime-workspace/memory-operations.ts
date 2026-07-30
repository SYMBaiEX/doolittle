import type { AppServices } from "@/services";
import type { MemoryTarget } from "@/types";

export type MemoryCommandOperation =
  | { action: "list"; target: MemoryTarget }
  | { action: "add"; target: MemoryTarget; content: string }
  | {
      action: "replace";
      target: MemoryTarget;
      oldText: string;
      content: string;
    }
  | { action: "remove"; target: MemoryTarget; oldText: string };

export function parseMemoryCommand(
  text: string,
): MemoryCommandOperation | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/memory")) {
    return undefined;
  }

  const listMatch = trimmed.match(/^\/memory\s+list\s+(memory|user)$/u);
  if (listMatch) {
    return { action: "list", target: listMatch[1] as MemoryTarget };
  }

  const addMatch = trimmed.match(/^\/memory\s+add\s+(memory|user)\s+(.+)$/u);
  if (addMatch) {
    return {
      action: "add",
      target: addMatch[1] as MemoryTarget,
      content: addMatch[2],
    };
  }

  const replaceMatch = trimmed.match(
    /^\/memory\s+replace\s+(memory|user)\s+(.+?)\s*=>\s*(.+)$/u,
  );
  if (replaceMatch) {
    return {
      action: "replace",
      target: replaceMatch[1] as MemoryTarget,
      oldText: replaceMatch[2],
      content: replaceMatch[3],
    };
  }

  const removeMatch = trimmed.match(
    /^\/memory\s+remove\s+(memory|user)\s+(.+)$/u,
  );
  if (removeMatch) {
    return {
      action: "remove",
      target: removeMatch[1] as MemoryTarget,
      oldText: removeMatch[2],
    };
  }

  return undefined;
}

export function executeMemoryCommandOperation(
  services: Pick<AppServices, "memory">,
  operation: MemoryCommandOperation,
  userId?: string,
): string {
  if (operation.action === "list") {
    return services.memory.renderSnapshot(operation.target, userId);
  }
  if (operation.action === "add") {
    return services.memory.add(operation.target, operation.content, userId);
  }
  if (operation.action === "replace") {
    return services.memory.replace(
      operation.target,
      operation.oldText,
      operation.content,
      userId,
    );
  }
  return services.memory.remove(operation.target, operation.oldText, userId);
}
