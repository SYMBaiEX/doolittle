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

export function createWorkspaceAction(services: AppServices): Action {
  return {
    name: "ELIZA_AGENT_WORKSPACE",
    similes: [
      "WORKSPACE_TREE",
      "WORKSPACE_READ",
      "WORKSPACE_SEARCH",
      "WORKSPACE_WRITE",
    ],
    description:
      "Explores and edits the local workspace with `/workspace tree|read|search|write` commands.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      return Boolean(text?.trim().startsWith("/workspace"));
    },
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      _options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      const trimmed = text?.trim() ?? "";
      let response = "";

      if (trimmed === "/workspace" || trimmed === "/workspace tree") {
        response = services.workspace.summary(40);
      } else if (trimmed.startsWith("/workspace read ")) {
        response = services.workspace.read(
          trimmed.replace("/workspace read ", "").trim(),
        );
      } else if (trimmed.startsWith("/workspace search ")) {
        const query = trimmed.replace("/workspace search ", "").trim();
        const results = services.workspace.search(query, 20);
        response = results.length
          ? results
              .map(
                (result) =>
                  `${result.path}\n${result.matches.map((line) => `  ${line}`).join("\n")}`,
              )
              .join("\n\n")
          : "No workspace matches found.";
      } else if (trimmed.startsWith("/workspace write ")) {
        const payload = trimmed.replace("/workspace write ", "");
        const [path, ...contentParts] = payload.split("::");
        const relativePath = path?.trim();
        const content = contentParts.join("::").trim();
        if (!relativePath || !content) {
          response = "Usage: /workspace write <path> :: <content>";
        } else {
          response = `Wrote ${services.workspace.write(relativePath, content)}.`;
        }
      } else {
        response =
          "Usage: /workspace tree | /workspace read <path> | /workspace search <query> | /workspace write <path> :: <content>";
      }

      await callback?.({ text: response, source: "workspace-action" });
      return { success: true, text: response };
    },
  };
}
