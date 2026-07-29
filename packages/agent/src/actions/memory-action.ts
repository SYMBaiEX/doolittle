import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { AppServices } from "@/services";
import type { MemoryTarget } from "@/types";

export type MemoryOperation =
  | { action: "list"; target: MemoryTarget }
  | { action: "add"; target: MemoryTarget; content: string }
  | {
      action: "replace";
      target: MemoryTarget;
      oldText: string;
      content: string;
    }
  | { action: "remove"; target: MemoryTarget; oldText: string };

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseMemoryCommand(text: string): MemoryOperation | undefined {
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

export function resolveMemoryOperationFromParams(
  params: unknown,
): MemoryOperation | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const record = params as Record<string, unknown>;
  const action = nonEmptyString(record.action);
  const target = nonEmptyString(record.target);
  if (
    !action ||
    !["list", "add", "replace", "remove"].includes(action) ||
    (target !== "memory" && target !== "user")
  ) {
    return undefined;
  }
  if (action === "list") {
    return { action, target };
  }
  const content = nonEmptyString(record.content);
  const oldText = nonEmptyString(record.oldText);
  if (action === "add" && content) {
    return { action, target, content };
  }
  if (action === "replace" && oldText && content) {
    return { action, target, oldText, content };
  }
  if (action === "remove" && oldText) {
    return { action, target, oldText };
  }
  return undefined;
}

export function executeMemoryOperation(
  services: Pick<AppServices, "memory">,
  operation: MemoryOperation,
): string {
  if (operation.action === "list") {
    return services.memory.renderSnapshot(operation.target);
  }
  if (operation.action === "add") {
    return services.memory.add(operation.target, operation.content);
  }
  if (operation.action === "replace") {
    return services.memory.replace(
      operation.target,
      operation.oldText,
      operation.content,
    );
  }
  return services.memory.remove(operation.target, operation.oldText);
}

export function createMemoryAction(services: AppServices): Action {
  return {
    name: "DOOLITTLE_MEMORY",
    similes: ["MEMORY_STORE", "SAVE_MEMORY", "EDIT_MEMORY"],
    description:
      "Manages persistent assistant or user memory. Use this when the user explicitly asks to list, save, replace, or remove a durable memory.",
    descriptionCompressed: "List or update durable assistant/user memory.",
    routingHint: "explicit durable memory read or mutation -> DOOLITTLE_MEMORY",
    contexts: ["memory"],
    validate: async () => true,
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      const command =
        resolveMemoryOperationFromParams(options?.parameters) ??
        (text ? parseMemoryCommand(text) : undefined);

      if (!command) {
        const response =
          "Usage: /memory list <memory|user>, /memory add <target> <text>, /memory replace <target> old => new, /memory remove <target> <text>";
        await callback?.({ text: response, source: "memory-action" });
        return { success: false, text: response };
      }

      const response = executeMemoryOperation(services, command);

      await callback?.({ text: response, source: "memory-action" });
      return {
        success: true,
        text: response,
        userFacingText: response,
        verifiedUserFacing: true,
        data: { action: command.action, target: command.target },
      };
    },
    examples: [
      [
        {
          name: "{{userName}}",
          content: {
            text: "/memory add user User prefers short technical updates.",
          },
        },
        {
          name: "{{agentName}}",
          content: {
            text: "Memory entry added.",
            actions: ["DOOLITTLE_MEMORY"],
          },
        },
      ],
    ],
    parameters: [
      {
        name: "action",
        description: "Memory operation to perform.",
        required: true,
        schema: {
          type: "string",
          enum: ["list", "add", "replace", "remove"],
        },
      },
      {
        name: "target",
        description: "Assistant memory or user memory.",
        required: true,
        schema: { type: "string", enum: ["memory", "user"] },
      },
      {
        name: "content",
        description: "New memory text for add or replace.",
        required: false,
        schema: { type: "string" },
      },
      {
        name: "oldText",
        description: "Existing memory text to replace or remove.",
        required: false,
        schema: { type: "string" },
      },
    ],
  };
}
