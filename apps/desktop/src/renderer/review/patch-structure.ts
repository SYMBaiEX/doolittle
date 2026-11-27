export type StructuredPatchLineKind =
  | "addition"
  | "deletion"
  | "context"
  | "meta";

export interface StructuredPatchLine {
  key: string;
  kind: StructuredPatchLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface StructuredPatchHunk {
  key: string;
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  section?: string;
  complete: boolean;
  additions: number;
  deletions: number;
  lines: StructuredPatchLine[];
}

export type StructuredPatchFileStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed";

export interface StructuredPatchFile {
  key: string;
  oldPath?: string;
  newPath?: string;
  displayPath?: string;
  status: StructuredPatchFileStatus;
  headerLines: string[];
  metadataLines: string[];
  hunks: StructuredPatchHunk[];
  additions: number;
  deletions: number;
}

export interface StructuredPatch {
  files: StructuredPatchFile[];
  additions: number;
  deletions: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:\s(.*))?$/u;
const DIFF_GIT_PREFIX = "diff --git ";

function unquotePath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"') || path.length < 2) {
    return path;
  }
  try {
    const parsed: unknown = JSON.parse(path);
    return typeof parsed === "string" ? parsed : path.slice(1, -1);
  } catch {
    return path.slice(1, -1);
  }
}

function normalizeDiffPath(value: string): string | undefined {
  const withoutTimestamp = value.trim().split("\t", 1)[0] ?? "";
  const path = unquotePath(withoutTimestamp);
  if (path === "/dev/null") return undefined;
  if (path.startsWith("a/") || path.startsWith("b/")) return path.slice(2);
  return path || undefined;
}

function parseDiffGitPaths(
  line: string,
): { oldPath?: string; newPath?: string } | null {
  if (!line.startsWith(DIFF_GIT_PREFIX)) return null;
  const body = line.slice(DIFF_GIT_PREFIX.length);
  const quoted = /^"(a\/(?:\\.|[^"])*)"\s+"(b\/(?:\\.|[^"])*)"$/u.exec(body);
  if (quoted) {
    return {
      oldPath: normalizeDiffPath(unquotePath(`"${quoted[1]}"`)),
      newPath: normalizeDiffPath(unquotePath(`"${quoted[2]}"`)),
    };
  }
  const unquoted = /^a\/(.*)\s+b\/(.*)$/u.exec(body);
  if (!unquoted) return { oldPath: undefined, newPath: undefined };
  return {
    oldPath: normalizeDiffPath(`a/${unquoted[1]}`),
    newPath: normalizeDiffPath(`b/${unquoted[2]}`),
  };
}

function fileStatus(file: StructuredPatchFile): StructuredPatchFileStatus {
  const metadata = file.metadataLines.join("\n");
  if (metadata.includes("new file mode")) return "added";
  if (metadata.includes("deleted file mode")) return "deleted";
  if (file.oldPath && file.newPath && file.oldPath !== file.newPath) {
    return "renamed";
  }
  if (
    !file.oldPath &&
    file.newPath &&
    file.headerLines.some((line) => line.startsWith("--- /dev/null"))
  ) {
    return "added";
  }
  if (
    file.oldPath &&
    !file.newPath &&
    file.headerLines.some((line) => line.startsWith("+++ /dev/null"))
  ) {
    return "deleted";
  }
  return "modified";
}

function refreshDisplayPath(file: StructuredPatchFile): void {
  file.displayPath = file.newPath ?? file.oldPath;
}

/**
 * Parses the unified diff text returned by the repository service into the
 * file, hunk, and line structure needed by review presentation. The parser is
 * deliberately tolerant: unrecognized lines are retained as metadata instead
 * of being dropped, and truncated patches still expose every received row.
 */
export function parseStructuredPatch(patch: string): StructuredPatch {
  const inputLines = patch.split(/\r?\n/u);
  if (inputLines.at(-1) === "") inputLines.pop();

  const files: StructuredPatchFile[] = [];
  let currentFile: StructuredPatchFile | undefined;
  let currentHunk: StructuredPatchHunk | undefined;
  let oldLine = 0;
  let newLine = 0;
  let oldRemaining = 0;
  let newRemaining = 0;
  let additions = 0;
  let deletions = 0;
  let acceptsNoNewlineMarker = false;

  const ensureFile = (): StructuredPatchFile => {
    if (currentFile) return currentFile;
    currentFile = {
      key: `file-${files.length}`,
      status: "modified",
      headerLines: [],
      metadataLines: [],
      hunks: [],
      additions: 0,
      deletions: 0,
    };
    files.push(currentFile);
    return currentFile;
  };

  const hunkActive = () =>
    currentHunk !== undefined && (oldRemaining > 0 || newRemaining > 0);

  const markHunkComplete = () => {
    if (currentHunk && oldRemaining <= 0 && newRemaining <= 0) {
      currentHunk.complete = true;
    }
  };

  inputLines.forEach((text) => {
    const diffGitPaths = parseDiffGitPaths(text);
    if (diffGitPaths) {
      currentFile = {
        key: `file-${files.length}`,
        oldPath: diffGitPaths.oldPath,
        newPath: diffGitPaths.newPath,
        displayPath: diffGitPaths.newPath ?? diffGitPaths.oldPath,
        status: "modified",
        headerLines: [text],
        metadataLines: [],
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      files.push(currentFile);
      currentHunk = undefined;
      oldRemaining = 0;
      newRemaining = 0;
      acceptsNoNewlineMarker = false;
      return;
    }

    const active = hunkActive();

    if (!active && (text.startsWith("--- ") || text.startsWith("+++ "))) {
      // Traditional unified diffs do not carry `diff --git` records. Once a
      // file header is complete, the next old-path marker opens the next file.
      if (
        text.startsWith("--- ") &&
        currentFile?.headerLines.some((line) => line.startsWith("+++ "))
      ) {
        currentFile = undefined;
        currentHunk = undefined;
        oldRemaining = 0;
        newRemaining = 0;
        acceptsNoNewlineMarker = false;
      }
      const file = ensureFile();
      const path = normalizeDiffPath(text.slice(4));
      if (text.startsWith("--- ")) file.oldPath = path;
      else file.newPath = path;
      refreshDisplayPath(file);
      file.headerLines.push(text);
      acceptsNoNewlineMarker = false;
      return;
    }

    // The no-newline marker describes the preceding content row but does not
    // count toward the hunk's line budget, so it can arrive just after the
    // budget has been exhausted.
    if (currentHunk && acceptsNoNewlineMarker && text.startsWith("\\")) {
      currentHunk.lines.push({
        key: `${currentHunk.key}-line-${currentHunk.lines.length}`,
        kind: "meta",
        text,
      });
      acceptsNoNewlineMarker = false;
      return;
    }

    const hunkMatch = HUNK_HEADER.exec(text);
    if (hunkMatch) {
      const file = ensureFile();
      oldLine = Number(hunkMatch[1]);
      newLine = Number(hunkMatch[3]);
      oldRemaining = Number(hunkMatch[2] ?? 1);
      newRemaining = Number(hunkMatch[4] ?? 1);
      currentHunk = {
        key: `${file.key}-hunk-${file.hunks.length}`,
        header: text,
        oldStart: oldLine,
        oldCount: oldRemaining,
        newStart: newLine,
        newCount: newRemaining,
        section: hunkMatch[5],
        complete: oldRemaining === 0 && newRemaining === 0,
        additions: 0,
        deletions: 0,
        lines: [],
      };
      file.hunks.push(currentHunk);
      acceptsNoNewlineMarker = false;
      return;
    }

    if (active && currentHunk && currentFile) {
      const key = `${currentHunk.key}-line-${currentHunk.lines.length}`;
      if (text.startsWith("+")) {
        currentHunk.lines.push({
          key,
          kind: "addition",
          text,
          newLine: newLine++,
        });
        currentHunk.additions += 1;
        currentFile.additions += 1;
        additions += 1;
        newRemaining -= 1;
        acceptsNoNewlineMarker = true;
        markHunkComplete();
        return;
      }
      if (text.startsWith("-")) {
        currentHunk.lines.push({
          key,
          kind: "deletion",
          text,
          oldLine: oldLine++,
        });
        currentHunk.deletions += 1;
        currentFile.deletions += 1;
        deletions += 1;
        oldRemaining -= 1;
        acceptsNoNewlineMarker = true;
        markHunkComplete();
        return;
      }
      if (text.startsWith(" ") || text === "") {
        currentHunk.lines.push({
          key,
          kind: "context",
          text,
          oldLine: oldLine++,
          newLine: newLine++,
        });
        oldRemaining -= 1;
        newRemaining -= 1;
        acceptsNoNewlineMarker = true;
        markHunkComplete();
        return;
      }
      acceptsNoNewlineMarker = false;
      currentHunk.lines.push({ key, kind: "meta", text });
      return;
    }

    const file = ensureFile();
    acceptsNoNewlineMarker = false;
    file.metadataLines.push(text);
    if (text.startsWith("rename from ")) {
      file.oldPath = text.slice("rename from ".length) || undefined;
      refreshDisplayPath(file);
    } else if (text.startsWith("rename to ")) {
      file.newPath = text.slice("rename to ".length) || undefined;
      refreshDisplayPath(file);
    }
  });

  for (const file of files) {
    file.status = fileStatus(file);
    refreshDisplayPath(file);
  }

  return { files, additions, deletions };
}
