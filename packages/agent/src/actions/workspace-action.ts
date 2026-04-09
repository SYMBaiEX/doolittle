import { existsSync, statSync } from "node:fs";
import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import {
  findEffectiveLocalCodebases,
  inspectEffectiveProject,
  readEffectiveWorkspaceFile,
  searchEffectiveWorkspace,
  writeEffectiveWorkspaceFile,
} from "@/runtime/native/service-bridge/index";
import type { AppServices } from "@/services";
import {
  resolveLocalProjectPath,
  resolveWorkspaceIntentFromParams,
  resolveWorkspaceIntentFromText,
  sanitizeFindQuery,
  type WorkspaceIntent,
} from "./workspace-action-intents";

async function summarizeProjectForOutput(
  runtime: IAgentRuntime,
  services: AppServices,
  projectPath: string,
): Promise<string> {
  const inspection = await inspectEffectiveProject(
    runtime,
    services,
    projectPath,
  );
  return [
    `Repo: ${inspection.name}`,
    `Path: ${inspection.path}`,
    `Type: ${inspection.type}`,
    "",
    "What matters:",
    inspection.packageName ? `- package: ${inspection.packageName}` : undefined,
    inspection.packageManager
      ? `- package manager: ${inspection.packageManager}`
      : undefined,
    inspection.workspacePatterns.length > 0
      ? `- workspaces: ${inspection.workspacePatterns.join(", ")}`
      : undefined,
    inspection.scripts.length > 0
      ? `- scripts: ${inspection.scripts.join(", ")}`
      : undefined,
    inspection.keyFolders.length > 0
      ? `- key folders: ${inspection.keyFolders.join(", ")}`
      : undefined,
    inspection.topEntries.length > 0
      ? `- top entries: ${inspection.topEntries.join(", ")}`
      : undefined,
    "",
    "Git:",
    inspection.git.available
      ? inspection.git.recentCommit
        ? `- recent commit: ${inspection.git.recentCommit}`
        : "- repository detected"
      : "- not detected",
    inspection.git.status ? `- status:\n${inspection.git.status}` : undefined,
    inspection.readmePreview
      ? `\nREADME preview:\n${inspection.readmePreview}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export {
  resolveLocalProjectPath,
  resolveWorkspaceIntentFromParams,
  resolveWorkspaceIntentFromText,
} from "./workspace-action-intents";

export async function executeWorkspaceIntent(
  runtime: IAgentRuntime,
  services: AppServices,
  workspaceDir: string,
  intent: WorkspaceIntent,
): Promise<string> {
  if (intent.kind === "tree") {
    return services.workspace.summary(40);
  }
  if (intent.kind === "overview") {
    const projectPath = intent.path
      ? (resolveLocalProjectPath(intent.path, workspaceDir) ?? workspaceDir)
      : workspaceDir;
    return summarizeProjectForOutput(runtime, services, projectPath);
  }
  if (intent.kind === "read") {
    return String(readEffectiveWorkspaceFile(runtime, services, intent.path));
  }
  if (intent.kind === "search") {
    const results = searchEffectiveWorkspace(
      runtime,
      services,
      intent.query,
      20,
    ) as Array<{
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
  if (intent.kind === "write") {
    return `Wrote ${String(writeEffectiveWorkspaceFile(runtime, services, intent.path, intent.content))}.`;
  }

  const query = sanitizeFindQuery(intent.query);
  if (!query) {
    return "I couldn't determine the codebase name to search for.";
  }
  const explicitProjectPath = resolveLocalProjectPath(query, workspaceDir);
  if (explicitProjectPath) {
    try {
      if (statSync(explicitProjectPath).isDirectory()) {
        return summarizeProjectForOutput(
          runtime,
          services,
          explicitProjectPath,
        );
      }
      return `Found file path: ${explicitProjectPath}`;
    } catch (error) {
      return `I found ${explicitProjectPath}, but couldn't inspect it: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const matches = await findEffectiveLocalCodebases(runtime, services, query);
  if (matches.length === 1 && existsSync(matches[0]?.path || "")) {
    try {
      if (statSync(matches[0].path).isDirectory()) {
        return summarizeProjectForOutput(runtime, services, matches[0].path);
      }
    } catch {
      // Fall back to raw result list below.
    }
  }

  const exactMatches = matches.filter((match) => match.exactBasenameMatch);
  if (exactMatches.length === 1 && existsSync(exactMatches[0]?.path || "")) {
    try {
      if (statSync(exactMatches[0].path).isDirectory()) {
        return summarizeProjectForOutput(
          runtime,
          services,
          exactMatches[0].path,
        );
      }
    } catch {
      // Fall back to raw result list below.
    }
  }

  return matches.length > 0
    ? [
        `Found matching local codebases:`,
        ...matches.map((match) => `- ${match.path}`),
      ].join("\n")
    : "No matching local codebase was found in the common development roots.";
}

export function createWorkspaceAction(
  services: AppServices,
  workspaceDir: string,
): Action {
  return {
    name: "DOOLITTLE_WORKSPACE",
    similes: [
      "WORKSPACE_TREE",
      "WORKSPACE_READ",
      "WORKSPACE_SEARCH",
      "WORKSPACE_WRITE",
    ],
    description:
      "Explores the local workspace. Use this to list files, read a file, search the repo, or write a file when the user asks directly.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      return Boolean(text && resolveWorkspaceIntentFromText(text));
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      const intent =
        resolveWorkspaceIntentFromParams(options?.parameters) ??
        (text ? resolveWorkspaceIntentFromText(text) : undefined);
      let response = "";

      if (intent) {
        response = await executeWorkspaceIntent(
          runtime,
          services,
          workspaceDir,
          intent,
        );
      } else {
        response =
          "I can list files, read a file, search the workspace, or write a file. Try `/workspace tree` or ask `search the repo for auth middleware`.";
      }

      await callback?.({ text: response, source: "workspace-action" });
      return { success: Boolean(intent), text: response };
    },
    examples: [
      [
        {
          name: "{{userName}}",
          content: { text: "Search the workspace for linked provider auth." },
        },
        {
          name: "{{agentName}}",
          content: {
            text: "packages/agent/src/runtime/native/account-auth/index.ts",
            actions: ["DOOLITTLE_WORKSPACE"],
          },
        },
      ],
    ],
  };
}
