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

function parseMemoryCommand(text: string):
  | { action: "list"; target: MemoryTarget }
  | { action: "add"; target: MemoryTarget; content: string }
  | { action: "replace"; target: MemoryTarget; oldText: string; content: string }
  | { action: "remove"; target: MemoryTarget; oldText: string }
  | undefined {
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

  const removeMatch = trimmed.match(/^\/memory\s+remove\s+(memory|user)\s+(.+)$/u);
  if (removeMatch) {
    return {
      action: "remove",
      target: removeMatch[1] as MemoryTarget,
      oldText: removeMatch[2],
    };
  }

  return undefined;
}

export function createMemoryAction(services: AppServices): Action {
  return {
    name: "ELIZA_AGENT_MEMORY",
    similes: ["MEMORY_STORE", "SAVE_MEMORY", "EDIT_MEMORY"],
    description:
      "Manages persistent memory stores. Understands `/memory list|add|replace|remove` commands.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      return Boolean(text && text.trim().startsWith("/memory"));
    },
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      _options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      const command = text ? parseMemoryCommand(text) : undefined;

      if (!command) {
        const response =
          "Usage: /memory list <memory|user>, /memory add <target> <text>, /memory replace <target> old => new, /memory remove <target> <text>";
        await callback?.({ text: response, source: "memory-action" });
        return { success: false, text: response };
      }

      let response = "";
      if (command.action === "list") {
        response = services.memory.renderSnapshot(command.target);
      } else if (command.action === "add") {
        response = services.memory.add(command.target, command.content);
      } else if (command.action === "replace") {
        response = services.memory.replace(command.target, command.oldText, command.content);
      } else {
        response = services.memory.remove(command.target, command.oldText);
      }

      await callback?.({ text: response, source: "memory-action" });
      return { success: true, text: response };
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
            actions: ["ELIZA_AGENT_MEMORY"],
          },
        },
      ],
    ],
  };
}
