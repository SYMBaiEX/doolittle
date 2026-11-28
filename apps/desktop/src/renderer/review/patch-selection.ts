export interface PatchHunkSelection {
  /** Zero-based index of the `diff --git` file section. */
  file: number;
  /** Zero-based hunk index within that file section. */
  hunk: number;
}

interface ParsedPatchHunk {
  header: string;
  lines: string[];
}

interface ParsedPatchFile {
  headerLines: string[];
  hunks: ParsedPatchHunk[];
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/u;

function parseGitPatchFiles(patch: string): ParsedPatchFile[] {
  const lines = patch.split("\n");
  if (lines.at(-1) === "") lines.pop();

  const files: ParsedPatchFile[] = [];
  let currentFile: ParsedPatchFile | undefined;
  let currentHunk: ParsedPatchHunk | undefined;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      currentFile = { headerLines: [line], hunks: [] };
      files.push(currentFile);
      currentHunk = undefined;
      continue;
    }
    if (!currentFile) continue;
    if (HUNK_HEADER.test(line)) {
      currentHunk = { header: line, lines: [] };
      currentFile.hunks.push(currentHunk);
      continue;
    }
    if (currentHunk) currentHunk.lines.push(line);
    else currentFile.headerLines.push(line);
  }
  return files;
}

/**
 * Returns true when the text has the standard Git file sections needed for a
 * backend-appliable subset. Traditional diffs remain displayable but cannot be
 * forwarded through Doolittle's repository mutation validation.
 */
export function canSelectPatchHunks(patch: string): boolean {
  return parseGitPatchFiles(patch).some((file) => file.hunks.length > 0);
}

/**
 * Rebuild a unified patch from complete file headers and only the selected
 * hunks. Hunk offsets deliberately remain unchanged: they describe positions
 * in the source snapshot, and `git apply --recount` tracks the offset drift
 * created when earlier selected hunks change line counts.
 */
export function selectPatchHunks(
  patch: string,
  selections: readonly PatchHunkSelection[],
): string {
  if (selections.length === 0) {
    throw new Error("At least one patch hunk must be selected.");
  }
  const files = parseGitPatchFiles(patch);
  if (files.length === 0) {
    throw new Error("A standard Git patch with file headers is required.");
  }

  const selected = new Map<string, PatchHunkSelection>();
  for (const selection of selections) {
    if (
      !Number.isInteger(selection.file) ||
      !Number.isInteger(selection.hunk) ||
      selection.file < 0 ||
      selection.hunk < 0
    ) {
      throw new Error("Patch hunk selections must be non-negative indexes.");
    }
    const key = `${selection.file}:${selection.hunk}`;
    if (selected.has(key)) {
      throw new Error("Patch hunk selections must not contain duplicates.");
    }
    const file = files[selection.file];
    if (!file?.hunks[selection.hunk]) {
      throw new Error("A selected patch hunk does not exist.");
    }
    selected.set(key, selection);
  }

  const output: string[] = [];
  files.forEach((file, fileIndex) => {
    const hunks = file.hunks.filter((_, hunkIndex) =>
      selected.has(`${fileIndex}:${hunkIndex}`),
    );
    if (hunks.length === 0) return;
    output.push(...file.headerLines);
    for (const hunk of hunks) {
      output.push(hunk.header, ...hunk.lines);
    }
  });

  if (output.length === 0) {
    throw new Error("The selection did not match any patch hunks.");
  }
  return `${output.join("\n")}\n`;
}
