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
  createNativeWorkspaceDirectory,
  patchNativeWorkspaceFile,
  readNativeWorkspaceFileLines,
  searchNativeWorkspaceFiles,
  writeNativeWorkspaceFileResult,
} from "@/runtime/native/service-bridge/tooling";
import type {
  WorkspaceFileSearchResult,
  WorkspaceReadLinesResult,
} from "@/services/workspace-service";

type ParamRecord = Record<string, unknown>;
type ActionParameters = NonNullable<Action["parameters"]>;

const READ_FILE_PARAMETERS: ActionParameters = [
  {
    name: "path",
    description:
      "File path to read inside the selected workspace. Relative paths are resolved from the workspace root.",
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
      "File path to create or overwrite inside the selected workspace.",
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
    description: "Directory path to create inside the selected workspace.",
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

function createActionResult(
  success: boolean,
  text: string,
  data?: ProviderDataRecord,
): ActionResult {
  return {
    success,
    text,
    userFacingText: text,
    verifiedUserFacing: success,
    data,
  };
}

function handlerError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatReadResult(result: WorkspaceReadLinesResult): string {
  return [
    `Read: ${result.path}`,
    `Lines: ${result.offset}-${result.end} of ${result.total}`,
    ...result.lines.map((line) => `${line.number}|${line.text}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function formatSearchResult(result: WorkspaceFileSearchResult): string {
  if (result.target === "files") {
    return [
      `File matches for "${result.pattern}" in ${result.root}:`,
      ...result.matches.map((match) => match.path),
    ].join("\n");
  }
  if (!result.matches.length) {
    return `No content matches for "${result.pattern}" in ${result.root}.`;
  }
  return [
    `Content matches for "${result.pattern}" in ${result.root}:`,
    ...result.matches.map(
      (match) => `${match.path}:${match.line ?? 1}: ${match.text ?? ""}`,
    ),
  ].join("\n");
}

function createReadFileAction(): Action {
  return {
    name: "READ_FILE",
    similes: ["DOOLITTLE_READ_FILE", "VIEW_FILE", "OPEN_FILE"],
    description:
      "Read a local text file with line numbers. Use this instead of terminal cat/head/tail.",
    descriptionCompressed: "Read a local text file with line numbers.",
    routingHint: "inspect one known file -> READ_FILE",
    parameters: READ_FILE_PARAMETERS,
    contexts: ["code", "system"],
    cacheStable: true,
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
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
        const response = formatReadResult(
          readNativeWorkspaceFileLines(runtime, path, {
            offset: numberParam(params, "offset", 1),
            limit: numberParam(params, "limit", 500),
          }),
        );
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

function createWriteFileAction(): Action {
  return {
    name: "WRITE_FILE",
    similes: ["DOOLITTLE_WRITE_FILE", "CREATE_FILE", "SAVE_FILE"],
    description:
      "Write complete content to a local file, creating parent directories automatically. Use this instead of terminal echo/cat heredoc for file creation.",
    descriptionCompressed: "Create or replace a local text file.",
    routingHint: "create or fully replace one file -> WRITE_FILE",
    parameters: WRITE_FILE_PARAMETERS,
    contexts: ["code", "system"],
    cacheStable: true,
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
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
        const result = await writeNativeWorkspaceFileResult(
          runtime,
          path,
          content,
        );
        const response = `Wrote: ${result.path}\nBytes: ${result.bytes}`;
        const mutation = {
          action: "WRITE_FILE",
          requestedPath: path,
          resolvedPath: result.path,
          success: true,
          message: `Wrote: ${result.path}`,
          bytes: result.bytes,
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
                size: result.bytes,
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

function createDirectoryAction(): Action {
  return {
    name: "CREATE_DIRECTORY",
    similes: ["MKDIR", "CREATE_FOLDER", "DOOLITTLE_CREATE_DIRECTORY"],
    description:
      "Create a local directory inside the selected workspace. WRITE_FILE creates parent directories automatically, so use this only when the directory itself is the requested artifact.",
    descriptionCompressed: "Create a local directory.",
    routingHint:
      "create an empty directory as the requested artifact -> CREATE_DIRECTORY",
    parameters: CREATE_DIRECTORY_PARAMETERS,
    contexts: ["code", "system"],
    cacheStable: true,
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
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
        const result = createNativeWorkspaceDirectory(runtime, path);
        const response = `${
          result.existed ? "Directory already existed" : "Created directory"
        }: ${result.path}`;
        const mutation = {
          action: "CREATE_DIRECTORY",
          requestedPath: path,
          resolvedPath: result.path,
          success: true,
          message: response,
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

function createPatchFileAction(): Action {
  return {
    name: "PATCH_FILE",
    similes: ["DOOLITTLE_PATCH_FILE", "EDIT_FILE", "MODIFY_FILE"],
    description:
      "Patch a local text file by replacing oldText with newText. Use this instead of terminal sed/awk for file edits.",
    descriptionCompressed: "Replace exact text in a local file.",
    routingHint: "make a targeted edit to an existing file -> PATCH_FILE",
    parameters: PATCH_FILE_PARAMETERS,
    contexts: ["code", "system"],
    cacheStable: true,
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
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
        const result = await patchNativeWorkspaceFile(
          runtime,
          path,
          oldText,
          newText,
          {
            replaceAll: booleanParam(params, "replaceAll"),
          },
        );
        const response = `Patched: ${result.path}\nReplacements: ${result.replacements}`;
        const mutation = {
          action: "PATCH_FILE",
          requestedPath: path,
          resolvedPath: result.path,
          success: true,
          message: `Patched: ${result.path}`,
          replacements: result.replacements,
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

function createSearchFilesAction(): Action {
  return {
    name: "SEARCH_FILES",
    similes: ["DOOLITTLE_SEARCH_FILES", "FIND_FILES", "GREP_FILES"],
    description:
      "Search local file contents or find files by name. Use this instead of terminal grep/rg/find/ls.",
    descriptionCompressed: "Search local file contents or names.",
    routingHint:
      "find text, symbols, or paths in the selected workspace -> SEARCH_FILES",
    parameters: SEARCH_FILES_PARAMETERS,
    contexts: ["code", "system"],
    cacheStable: true,
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
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
        const response = formatSearchResult(
          searchNativeWorkspaceFiles(runtime, {
            pattern: stringParam(params, "pattern", "query", "term"),
            path: stringParam(params, "path", "directory") || ".",
            target,
            limit: numberParam(params, "limit", 50),
          }),
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

export function createFileActions(): Action[] {
  return [
    createReadFileAction(),
    createWriteFileAction(),
    createDirectoryAction(),
    createPatchFileAction(),
    createSearchFilesAction(),
  ];
}
