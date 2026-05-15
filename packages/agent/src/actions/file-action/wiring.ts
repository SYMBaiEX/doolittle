import {
  type Action,
  type ActionResult,
  type HandlerCallback,
  type HandlerOptions,
  type IAgentRuntime,
  type Memory,
  type ProviderDataRecord,
  type State,
  validateActionParams,
} from "@elizaos/core";
import { buildActionResultData } from "@/runtime/action-result-metadata";
import {
  createLocalDirectory,
  patchLocalTextFile,
  readLocalTextFile,
  searchLocalFiles,
  writeLocalTextFile,
} from "./operations";

type ParamRecord = Record<string, unknown>;
type ActionParameters = NonNullable<Action["parameters"]>;

const READ_FILE_PARAMETERS: ActionParameters = [
  {
    name: "path",
    description:
      "File path to read. Supports absolute paths, ~/ paths, dev/code/projects paths, and account-qualified paths like symbiex/dev/app/file.ts.",
    required: true,
    schema: { type: "string" },
  },
  {
    name: "offset",
    description: "1-indexed line number to start reading from.",
    required: false,
    schema: { type: "integer", default: 1 },
  },
  {
    name: "limit",
    description: "Maximum lines to read.",
    required: false,
    schema: { type: "integer", default: 500 },
  },
];

const WRITE_FILE_PARAMETERS: ActionParameters = [
  {
    name: "path",
    description:
      "File path to create or overwrite. Supports absolute paths, ~/ paths, dev/code/projects paths, and account-qualified paths like symbiex/dev/the-effect/index.html.",
    required: true,
    schema: { type: "string" },
  },
  {
    name: "content",
    description: "Complete file contents to write.",
    required: true,
    schema: { type: "string" },
  },
];

const CREATE_DIRECTORY_PARAMETERS: ActionParameters = [
  {
    name: "path",
    description:
      "Directory path to create. Supports absolute paths, ~/ paths, dev/code/projects paths, and account-qualified paths like symbiex/dev/the-effect.",
    required: true,
    schema: { type: "string" },
  },
];

const PATCH_FILE_PARAMETERS: ActionParameters = [
  {
    name: "path",
    description: "File path to patch.",
    required: true,
    schema: { type: "string" },
  },
  {
    name: "oldText",
    description:
      "Exact text to replace. Include enough surrounding context to make it unique.",
    required: true,
    schema: { type: "string" },
  },
  {
    name: "newText",
    description: "Replacement text.",
    required: true,
    schema: { type: "string" },
  },
  {
    name: "replaceAll",
    description: "Replace all matches instead of requiring one unique match.",
    required: false,
    schema: { type: "boolean", default: false },
  },
];

const SEARCH_FILES_PARAMETERS: ActionParameters = [
  {
    name: "pattern",
    description: "Regex or literal pattern to search for.",
    required: true,
    schema: { type: "string" },
  },
  {
    name: "path",
    description: "Directory or file to search. Defaults to the workspace.",
    required: false,
    schema: { type: "string", default: "." },
  },
  {
    name: "target",
    description: "Search file contents or file names.",
    required: false,
    schema: {
      type: "string",
      enum: ["content", "files"],
      default: "content",
    },
  },
  {
    name: "limit",
    description: "Maximum matching lines or files.",
    required: false,
    schema: { type: "integer", default: 50 },
  },
];

function textFromMessage(message: Memory): string {
  return typeof message.content === "string"
    ? message.content
    : typeof message.content?.text === "string"
      ? message.content.text
      : "";
}

function validateParams(
  actionName: string,
  parameters: ActionParameters,
  options: HandlerOptions | undefined,
): ParamRecord {
  const validation = validateActionParams(
    { name: actionName, parameters } as Action,
    options?.parameters,
  );

  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  return validation.params && typeof validation.params === "object"
    ? (validation.params as ParamRecord)
    : {};
}

function stringParam(params: ParamRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function numberParam(
  params: ParamRecord,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function booleanParam(params: ParamRecord, key: string): boolean {
  const value = params[key];
  return value === true || value === "true";
}

function likelyFileWork(text: string): boolean {
  return /\b(?:file|folder|directory|project|html|css|js|javascript|typescript|json|md|markdown|source)\b/iu.test(
    text,
  );
}

function createActionResult(
  success: boolean,
  text: string,
  data?: ProviderDataRecord,
): ActionResult {
  return { success, text, data };
}

function handlerError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstResponseLine(response: string): string {
  return response.split(/\r?\n/u)[0]?.trim() || response.trim();
}

function responseNumber(response: string, label: string): number | undefined {
  const match = new RegExp(`^${label}:\\s*(\\d+)`, "imu").exec(response);
  return match ? Number.parseInt(match[1] ?? "", 10) : undefined;
}

function resolvedMutationPath(response: string): string | undefined {
  const match =
    /^(?:Wrote|Patched|Created directory|Directory already existed):\s*(.+)$/imu.exec(
      response,
    );
  return match?.[1]?.trim();
}

function createReadFileAction(workspaceDir: string): Action {
  return {
    name: "READ_FILE",
    similes: ["DOOLITTLE_READ_FILE", "VIEW_FILE", "OPEN_FILE"],
    description:
      "Read a local text file with line numbers. Use this instead of terminal cat/head/tail.",
    parameters: READ_FILE_PARAMETERS,
    contexts: ["code", "system"],
    validate: async (_runtime: IAgentRuntime, message: Memory) =>
      /\b(?:read|open|show|view|cat)\b/iu.test(textFromMessage(message)) &&
      likelyFileWork(textFromMessage(message)),
    handler: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ) => {
      try {
        const params = validateParams(
          "READ_FILE",
          READ_FILE_PARAMETERS,
          options,
        );
        const path = stringParam(params, "path", "file", "target");
        const response = readLocalTextFile({ workspaceDir }, path, {
          offset: numberParam(params, "offset", 1),
          limit: numberParam(params, "limit", 500),
        });
        await callback?.({ text: response, source: "file-action" });
        return createActionResult(
          true,
          response,
          buildActionResultData(
            { fileOperation: { type: "read", target: path } },
            { path },
          ),
        );
      } catch (error) {
        const response = `READ_FILE failed: ${handlerError(error)}`;
        await callback?.({ text: response, source: "file-action" });
        return createActionResult(false, response);
      }
    },
  };
}

function createWriteFileAction(workspaceDir: string): Action {
  return {
    name: "WRITE_FILE",
    similes: ["DOOLITTLE_WRITE_FILE", "CREATE_FILE", "SAVE_FILE"],
    description:
      "Write complete content to a local file, creating parent directories automatically. Use this instead of terminal echo/cat heredoc for file creation.",
    parameters: WRITE_FILE_PARAMETERS,
    contexts: ["code", "system"],
    validate: async (_runtime: IAgentRuntime, message: Memory) =>
      /\b(?:write|create|make|generate|build|scaffold|save|add)\b/iu.test(
        textFromMessage(message),
      ) && likelyFileWork(textFromMessage(message)),
    handler: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ) => {
      let path = "";
      try {
        const params = validateParams(
          "WRITE_FILE",
          WRITE_FILE_PARAMETERS,
          options,
        );
        path = stringParam(params, "path", "file", "target");
        const content = stringParam(params, "content", "text");
        if (!content) {
          throw new Error("content is required.");
        }
        const response = writeLocalTextFile({ workspaceDir }, path, content);
        const mutation = {
          action: "WRITE_FILE",
          requestedPath: path,
          resolvedPath: resolvedMutationPath(response),
          success: true,
          message: firstResponseLine(response),
          bytes: responseNumber(response, "Bytes"),
        };
        await callback?.({ text: response, source: "file-action" });
        return createActionResult(
          true,
          response,
          buildActionResultData(
            {
              mutation,
              fileOperation: {
                type: "write",
                target: path,
                size: mutation.bytes ?? content.length,
              },
            },
            { path },
          ),
        );
      } catch (error) {
        const response = `WRITE_FILE failed: ${handlerError(error)}`;
        const mutation = {
          action: "WRITE_FILE",
          requestedPath: path || undefined,
          success: false,
          message: response,
        };
        await callback?.({ text: response, source: "file-action" });
        return createActionResult(
          false,
          response,
          buildActionResultData({
            mutation,
            fileOperation: path ? { type: "write", target: path } : undefined,
          }),
        );
      }
    },
  };
}

function createDirectoryAction(workspaceDir: string): Action {
  return {
    name: "CREATE_DIRECTORY",
    similes: ["MKDIR", "CREATE_FOLDER", "DOOLITTLE_CREATE_DIRECTORY"],
    description:
      "Create a local directory under the workspace or a local development root. WRITE_FILE creates parent directories automatically, so use this only when the directory itself is the requested artifact.",
    parameters: CREATE_DIRECTORY_PARAMETERS,
    contexts: ["code", "system"],
    validate: async (_runtime: IAgentRuntime, message: Memory) =>
      /\b(?:mkdir|make|create|set\s+up|setup|scaffold)\b/iu.test(
        textFromMessage(message),
      ) && /\b(?:directory|folder|project)\b/iu.test(textFromMessage(message)),
    handler: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ) => {
      let path = "";
      try {
        const params = validateParams(
          "CREATE_DIRECTORY",
          CREATE_DIRECTORY_PARAMETERS,
          options,
        );
        path = stringParam(params, "path", "directory", "folder", "target");
        const response = createLocalDirectory({ workspaceDir }, path);
        const mutation = {
          action: "CREATE_DIRECTORY",
          requestedPath: path,
          resolvedPath: resolvedMutationPath(response),
          success: true,
          message: firstResponseLine(response),
        };
        await callback?.({ text: response, source: "file-action" });
        return createActionResult(
          true,
          response,
          buildActionResultData(
            {
              mutation,
              fileOperation: { type: "write", target: path },
            },
            { path },
          ),
        );
      } catch (error) {
        const response = `CREATE_DIRECTORY failed: ${handlerError(error)}`;
        const mutation = {
          action: "CREATE_DIRECTORY",
          requestedPath: path || undefined,
          success: false,
          message: response,
        };
        await callback?.({ text: response, source: "file-action" });
        return createActionResult(
          false,
          response,
          buildActionResultData({
            mutation,
            fileOperation: path ? { type: "write", target: path } : undefined,
          }),
        );
      }
    },
  };
}

function createPatchFileAction(workspaceDir: string): Action {
  return {
    name: "PATCH_FILE",
    similes: ["DOOLITTLE_PATCH_FILE", "EDIT_FILE", "MODIFY_FILE"],
    description:
      "Patch a local text file by replacing oldText with newText. Use this instead of terminal sed/awk for file edits.",
    parameters: PATCH_FILE_PARAMETERS,
    contexts: ["code", "system"],
    validate: async (_runtime: IAgentRuntime, message: Memory) =>
      /\b(?:patch|edit|update|modify|change|replace)\b/iu.test(
        textFromMessage(message),
      ) && likelyFileWork(textFromMessage(message)),
    handler: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ) => {
      let path = "";
      try {
        const params = validateParams(
          "PATCH_FILE",
          PATCH_FILE_PARAMETERS,
          options,
        );
        path = stringParam(params, "path", "file", "target");
        const oldText = stringParam(params, "oldText", "old_string", "old");
        const newText = stringParam(params, "newText", "new_string", "new");
        const response = patchLocalTextFile(
          { workspaceDir },
          path,
          oldText,
          newText,
          {
            replaceAll: booleanParam(params, "replaceAll"),
          },
        );
        const mutation = {
          action: "PATCH_FILE",
          requestedPath: path,
          resolvedPath: resolvedMutationPath(response),
          success: true,
          message: firstResponseLine(response),
          replacements: responseNumber(response, "Replacements"),
        };
        await callback?.({ text: response, source: "file-action" });
        return createActionResult(
          true,
          response,
          buildActionResultData(
            {
              mutation,
              fileOperation: {
                type: "edit",
                target: path,
                size: newText.length,
              },
            },
            { path },
          ),
        );
      } catch (error) {
        const response = `PATCH_FILE failed: ${handlerError(error)}`;
        const mutation = {
          action: "PATCH_FILE",
          requestedPath: path || undefined,
          success: false,
          message: response,
        };
        await callback?.({ text: response, source: "file-action" });
        return createActionResult(
          false,
          response,
          buildActionResultData({
            mutation,
            fileOperation: path ? { type: "edit", target: path } : undefined,
          }),
        );
      }
    },
  };
}

function createSearchFilesAction(workspaceDir: string): Action {
  return {
    name: "SEARCH_FILES",
    similes: ["DOOLITTLE_SEARCH_FILES", "FIND_FILES", "GREP_FILES"],
    description:
      "Search local file contents or find files by name. Use this instead of terminal grep/rg/find/ls.",
    parameters: SEARCH_FILES_PARAMETERS,
    contexts: ["code", "system"],
    validate: async (_runtime: IAgentRuntime, message: Memory) =>
      /\b(?:search|find|look for|grep|list|show)\b/iu.test(
        textFromMessage(message),
      ) &&
      /\b(?:file|files|repo|repository|workspace|codebase|project)\b/iu.test(
        textFromMessage(message),
      ),
    handler: async (
      _runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ) => {
      try {
        const params = validateParams(
          "SEARCH_FILES",
          SEARCH_FILES_PARAMETERS,
          options,
        );
        const target =
          stringParam(params, "target") === "files" ? "files" : "content";
        const response = searchLocalFiles(
          { workspaceDir },
          {
            pattern: stringParam(params, "pattern", "query", "term"),
            path: stringParam(params, "path", "directory") || ".",
            target,
            limit: numberParam(params, "limit", 50),
          },
        );
        await callback?.({ text: response, source: "file-action" });
        return createActionResult(
          true,
          response,
          buildActionResultData({
            fileOperation: {
              type: "search",
              target: stringParam(params, "path", "directory") || ".",
            },
          }),
        );
      } catch (error) {
        const response = `SEARCH_FILES failed: ${handlerError(error)}`;
        await callback?.({ text: response, source: "file-action" });
        return createActionResult(false, response);
      }
    },
  };
}

export function createFileActions(workspaceDir: string): Action[] {
  return [
    createReadFileAction(workspaceDir),
    createWriteFileAction(workspaceDir),
    createDirectoryAction(workspaceDir),
    createPatchFileAction(workspaceDir),
    createSearchFilesAction(workspaceDir),
  ];
}
