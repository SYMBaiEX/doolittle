import type { CodeEditorStateSnapshot } from "./components/CodeEditor";

const MAX_EDITOR_CONTENT_CHARS = 32_000;
const MAX_SESSION_UPDATES = 100;

export type DesktopAcpPromptBlock =
  | { type: "text"; text: string }
  | {
      type: "resource_link";
      uri: string;
      name: string;
      mimeType?: string;
    }
  | {
      type: "resource";
      resource: { uri: string; text: string; mimeType?: string };
    };

export interface DesktopAcpSessionUpdate {
  cursor: number;
  sessionId?: string;
  receivedAt?: string;
  update: unknown;
}

export interface DesktopAcpSnapshot {
  sessionId: string;
  cursor: number;
  updates: DesktopAcpSessionUpdate[];
}

export interface DesktopAcpTerminal {
  terminalId?: string;
  output?: string;
  [key: string]: unknown;
}

export interface DesktopAcpPromptResult {
  stopReason?: string;
  updates?: DesktopAcpSessionUpdate[];
}

export interface DesktopAcpCapabilities {
  embeddedContext: boolean;
}

export interface DesktopAcpEditorContext {
  activeFile: string;
  path: string;
  uri: string;
  language: string;
  content: string;
  version: number;
  dirty: boolean;
  focused: boolean;
  cursor?: {
    lineNumber: number;
    column: number;
  };
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    text: string;
  };
  visibleRanges: Array<{
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }>;
  resources: Array<{
    uri: string;
    name: string;
    text: string;
  }>;
}

export function buildDesktopAcpPromptBlocks(
  text: string,
  context: DesktopAcpEditorContext | undefined,
  capabilities: DesktopAcpCapabilities,
): DesktopAcpPromptBlock[] {
  const normalizedText = text.trim();
  if (!normalizedText) throw new Error("An ACP prompt is required.");
  const blocks: DesktopAcpPromptBlock[] = [
    { type: "text", text: normalizedText },
  ];
  if (!context) return blocks;
  blocks.push(
    capabilities.embeddedContext
      ? {
          type: "resource",
          resource: {
            uri: context.uri,
            text: context.content,
            mimeType: "text/plain",
          },
        }
      : {
          type: "resource_link",
          uri: context.uri,
          name: context.activeFile,
          mimeType: "text/plain",
        },
  );
  return blocks;
}

export function describeDesktopAcpUpdate(update: unknown): string {
  if (!update || typeof update !== "object") return "ACP update";
  const record = update as Record<string, unknown>;
  for (const key of ["sessionUpdate", "type", "kind", "status"]) {
    if (typeof record[key] === "string" && record[key]) {
      return record[key] as string;
    }
  }
  return "ACP update";
}

export function desktopAcpResponseText(
  updates: DesktopAcpSessionUpdate[],
): string {
  return updates
    .map((entry) => {
      if (!entry.update || typeof entry.update !== "object") return "";
      const update = entry.update as Record<string, unknown>;
      if (update.sessionUpdate !== "agent_message_chunk") return "";
      const content =
        update.content && typeof update.content === "object"
          ? (update.content as Record<string, unknown>)
          : undefined;
      return content?.type === "text" && typeof content.text === "string"
        ? content.text
        : "";
    })
    .join("");
}

export function mergeDesktopAcpUpdates(
  current: DesktopAcpSessionUpdate[],
  incoming: DesktopAcpSessionUpdate[],
): DesktopAcpSessionUpdate[] {
  const merged = new Map<number, DesktopAcpSessionUpdate>();
  for (const entry of [...current, ...incoming]) {
    if (Number.isSafeInteger(entry.cursor) && entry.cursor >= 0) {
      merged.set(entry.cursor, entry);
    }
  }
  return [...merged.values()]
    .sort((left, right) => left.cursor - right.cursor)
    .slice(-MAX_SESSION_UPDATES);
}

export function buildDesktopAcpEditorContext(
  snapshot: CodeEditorStateSnapshot,
  dirty: boolean,
): DesktopAcpEditorContext {
  const content = snapshot.content.slice(0, MAX_EDITOR_CONTENT_CHARS);
  return {
    activeFile: snapshot.path,
    path: snapshot.path,
    uri: snapshot.uri,
    language: snapshot.language,
    content,
    version: snapshot.version,
    dirty,
    focused: snapshot.focused,
    cursor: snapshot.cursor
      ? {
          lineNumber: snapshot.cursor.line,
          column: snapshot.cursor.column,
        }
      : undefined,
    selection: snapshot.selection
      ? {
          startLineNumber: snapshot.selection.startLine,
          startColumn: snapshot.selection.startColumn,
          endLineNumber: snapshot.selection.endLine,
          endColumn: snapshot.selection.endColumn,
          text: snapshot.selection.text.slice(0, MAX_EDITOR_CONTENT_CHARS),
        }
      : undefined,
    visibleRanges: snapshot.visibleRanges.slice(0, 20).map((range) => ({
      startLineNumber: range.startLine,
      startColumn: range.startColumn,
      endLineNumber: range.endLine,
      endColumn: range.endColumn,
    })),
    resources: [
      {
        uri: snapshot.uri,
        name: snapshot.path.split("/").at(-1) ?? snapshot.path,
        text: content,
      },
    ],
  };
}
