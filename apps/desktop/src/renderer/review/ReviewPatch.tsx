import { useMemo } from "react";
import type { ReviewComment, ReviewCommentAnchor } from "../review-comments";
import {
  REVIEW_ADDITIONS_CLASS,
  REVIEW_DELETIONS_CLASS,
  REVIEW_PATCH_CANVAS_CLASS,
  REVIEW_PATCH_ERROR_CLASS,
  REVIEW_PATCH_FILE_CLASS,
  REVIEW_PATCH_FILE_HEADER_CLASS,
  REVIEW_PATCH_FILE_STATS_CLASS,
  REVIEW_PATCH_FILE_TITLE_CLASS,
  REVIEW_PATCH_GUTTER_CLASS,
  REVIEW_PATCH_HUNK_ACTIONS_CLASS,
  REVIEW_PATCH_HUNK_CLASS,
  REVIEW_PATCH_HUNK_HEADER_CLASS,
  REVIEW_PATCH_HUNK_NOTE_CLASS,
  REVIEW_PATCH_LINE_NUMBER_CLASS,
  REVIEW_PATCH_METADATA_CLASS,
  REVIEW_PATCH_PARTIAL_CLASS,
  REVIEW_PATCH_SCROLL_CLASS,
  reviewPatchLineClass,
} from "./layout";
import { canSelectPatchHunks, selectPatchHunks } from "./patch-selection";
import {
  parseStructuredPatch,
  type StructuredPatchFile,
  type StructuredPatchLine,
} from "./patch-structure";

export type ReviewPatchMutationType =
  | "stage-hunk"
  | "unstage-hunk"
  | "discard-hunk";

export interface ReviewPatchMutation {
  type: ReviewPatchMutationType;
  patch: string;
  label: string;
}

interface ReviewPatchProps {
  patch: string;
  path: string;
  truncated?: boolean;
  staged?: boolean;
  mutationBusy?: boolean;
  mutationError?: string;
  selectedPathComments: ReviewComment[];
  onStartComment: (path: string, anchor?: ReviewCommentAnchor) => void;
  onPatchMutation?: (mutation: ReviewPatchMutation) => void;
}

function lineAnchor(
  line: StructuredPatchLine,
): ReviewCommentAnchor | undefined {
  const side = line.kind === "deletion" ? "old" : "new";
  const lineNumber = line.kind === "deletion" ? line.oldLine : line.newLine;
  if (
    (line.kind !== "addition" &&
      line.kind !== "deletion" &&
      line.kind !== "context") ||
    lineNumber === undefined
  ) {
    return undefined;
  }
  return {
    side,
    line: lineNumber,
    preview: line.text.slice(1, 241),
  };
}

function fileLabel(file: StructuredPatchFile, fallbackPath: string): string {
  if (
    file.status === "renamed" &&
    file.oldPath &&
    file.newPath &&
    file.oldPath !== file.newPath
  ) {
    return `${file.oldPath} → ${file.newPath}`;
  }
  return file.displayPath ?? fallbackPath;
}

function mutationFormatSupported(file: StructuredPatchFile): boolean {
  const diffHeader = file.headerLines.find((line) =>
    line.startsWith("diff --git "),
  );
  if (!diffHeader || diffHeader.startsWith('diff --git "')) return false;
  if (
    file.status !== "modified" ||
    !file.oldPath ||
    !file.newPath ||
    file.oldPath !== file.newPath
  ) {
    return false;
  }
  return !file.metadataLines.some((line) =>
    /^(?:old mode |new mode |new file mode |deleted file mode |similarity index |rename from |rename to |GIT binary patch|Binary files )/u.test(
      line,
    ),
  );
}

function decisionBoundaryNote(
  file: StructuredPatchFile,
  truncated: boolean,
  selectable: boolean,
  hasMutationHandler: boolean,
): string {
  if (!hasMutationHandler || file.hunks.length === 0) return "";
  if (truncated) return "Hunk decisions are disabled for partial patches.";
  if (!selectable || !mutationFormatSupported(file)) {
    return "Hunk decisions are unavailable for this file format.";
  }
  return "";
}

export function ReviewPatch({
  patch,
  path,
  truncated = false,
  staged = false,
  mutationBusy = false,
  mutationError = "",
  selectedPathComments,
  onStartComment,
  onPatchMutation,
}: ReviewPatchProps) {
  const structured = useMemo(() => parseStructuredPatch(patch), [patch]);
  const selectable = useMemo(() => canSelectPatchHunks(patch), [patch]);
  const commentedLines = useMemo(
    () =>
      new Set(
        selectedPathComments.flatMap((comment) =>
          comment.anchor
            ? [`${comment.anchor.side}:${comment.anchor.line}`]
            : [],
        ),
      ),
    [selectedPathComments],
  );

  const mutateHunk = (
    type: ReviewPatchMutationType,
    fileIndex: number,
    hunkIndex: number,
    label: string,
  ) => {
    if (!onPatchMutation || mutationBusy) return;
    onPatchMutation({
      type,
      patch: selectPatchHunks(patch, [{ file: fileIndex, hunk: hunkIndex }]),
      label,
    });
  };

  return (
    <section
      aria-label={`Patch for ${path}`}
      className={REVIEW_PATCH_SCROLL_CLASS}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The patch must remain keyboard-scrollable on both axes.
      tabIndex={0}
    >
      <div className={REVIEW_PATCH_CANVAS_CLASS}>
        {truncated ? (
          <div className={REVIEW_PATCH_PARTIAL_CLASS}>
            Partial patch · showing the received portion
          </div>
        ) : null}
        {mutationError ? (
          <div className={REVIEW_PATCH_ERROR_CLASS} role="alert">
            {mutationError}
          </div>
        ) : null}
        {structured.files.map((file, fileIndex) => {
          const label = fileLabel(file, path);
          const hasLineCounts = file.additions > 0 || file.deletions > 0;
          const formatSupported = mutationFormatSupported(file);
          const canMutateFile = Boolean(
            onPatchMutation && !truncated && selectable && formatSupported,
          );
          const boundaryNote = decisionBoundaryNote(
            file,
            truncated,
            selectable,
            Boolean(onPatchMutation),
          );
          return (
            <section
              aria-label={label}
              className={REVIEW_PATCH_FILE_CLASS}
              data-patch-file={label}
              key={file.key}
            >
              <header className={REVIEW_PATCH_FILE_HEADER_CLASS}>
                <div className={REVIEW_PATCH_FILE_TITLE_CLASS}>
                  <span>{file.status} file</span>
                  <h3>{label}</h3>
                </div>
                {boundaryNote ? (
                  <span className={REVIEW_PATCH_HUNK_NOTE_CLASS}>
                    {boundaryNote}
                  </span>
                ) : null}
                {hasLineCounts ? (
                  <div className={REVIEW_PATCH_FILE_STATS_CLASS}>
                    <span className={REVIEW_ADDITIONS_CLASS}>
                      +{file.additions}
                    </span>
                    <span className={REVIEW_DELETIONS_CLASS}>
                      −{file.deletions}
                    </span>
                  </div>
                ) : null}
              </header>
              {file.metadataLines.length > 0 ? (
                <div className={REVIEW_PATCH_METADATA_CLASS}>
                  {file.metadataLines.map((line, index) => (
                    // Metadata order is meaningful and rows are stateless.
                    // biome-ignore lint/suspicious/noArrayIndexKey: The patch is immutable while rendered.
                    <div key={`${file.key}-metadata-${index}`}>{line}</div>
                  ))}
                </div>
              ) : null}
              {file.hunks.map((hunk, hunkIndex) => {
                const hunkLabel = `Hunk at old line ${hunk.oldStart}`;
                return (
                  <section
                    aria-label={`Hunk old line ${hunk.oldStart}, new line ${hunk.newStart}`}
                    className={REVIEW_PATCH_HUNK_CLASS}
                    data-patch-hunk={hunk.header}
                    key={hunk.key}
                  >
                    <header className={REVIEW_PATCH_HUNK_HEADER_CLASS}>
                      <h4>
                        <code>{hunk.header}</code>
                      </h4>
                      {canMutateFile ? (
                        <div className={REVIEW_PATCH_HUNK_ACTIONS_CLASS}>
                          {staged ? <span>staged</span> : null}
                          {hunk.complete ? (
                            staged ? (
                              <button
                                aria-label={`Reject staged hunk at old line ${hunk.oldStart}`}
                                disabled={mutationBusy}
                                onClick={() =>
                                  mutateHunk(
                                    "unstage-hunk",
                                    fileIndex,
                                    hunkIndex,
                                    hunkLabel,
                                  )
                                }
                                title="Unstage this hunk; keep the edit in the working tree"
                                type="button"
                              >
                                Unstage
                              </button>
                            ) : (
                              <>
                                <button
                                  aria-label={`Accept hunk at old line ${hunk.oldStart}`}
                                  disabled={mutationBusy}
                                  onClick={() =>
                                    mutateHunk(
                                      "stage-hunk",
                                      fileIndex,
                                      hunkIndex,
                                      hunkLabel,
                                    )
                                  }
                                  title="Accept this hunk into the index"
                                  type="button"
                                >
                                  Accept
                                </button>
                                <button
                                  aria-label={`Reject hunk at old line ${hunk.oldStart}`}
                                  className="danger"
                                  disabled={mutationBusy}
                                  onClick={() =>
                                    mutateHunk(
                                      "discard-hunk",
                                      fileIndex,
                                      hunkIndex,
                                      hunkLabel,
                                    )
                                  }
                                  title="Reject and discard this working-tree hunk"
                                  type="button"
                                >
                                  Reject
                                </button>
                              </>
                            )
                          ) : (
                            <span>partial hunk</span>
                          )}
                        </div>
                      ) : null}
                    </header>
                    <div>
                      {hunk.lines.map((line) => {
                        const anchor = lineAnchor(line);
                        return (
                          <div
                            className={reviewPatchLineClass(line.kind)}
                            data-kind={line.kind}
                            key={line.key}
                          >
                            {anchor ? (
                              <button
                                aria-label={`Add review note on ${anchor.side === "new" ? "new" : "old"} line ${anchor.line}`}
                                className={
                                  commentedLines.has(
                                    `${anchor.side}:${anchor.line}`,
                                  )
                                    ? "has-comment"
                                    : ""
                                }
                                onClick={() => onStartComment(path, anchor)}
                                title={`Comment on ${anchor.side === "new" ? "+" : "−"} line ${anchor.line}`}
                                type="button"
                              >
                                +
                              </button>
                            ) : (
                              <i
                                aria-hidden="true"
                                className={REVIEW_PATCH_GUTTER_CLASS}
                              />
                            )}
                            <span
                              aria-hidden="true"
                              className={REVIEW_PATCH_LINE_NUMBER_CLASS}
                            >
                              {line.oldLine ?? ""}
                            </span>
                            <span
                              aria-hidden="true"
                              className={REVIEW_PATCH_LINE_NUMBER_CLASS}
                            >
                              {line.newLine ?? ""}
                            </span>
                            <code>{line.text || " "}</code>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </section>
          );
        })}
      </div>
    </section>
  );
}
