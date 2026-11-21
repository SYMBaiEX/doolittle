import { Copy, WrapText } from "lucide-react";
import { useMemo, useState } from "react";
import { copyContextText } from "../context-menu-clipboard";
import { UiIcon } from "./UiIcon";
import "./workspace-patch-view.css";

interface PatchLine {
  text: string;
  kind: "addition" | "removal" | "context" | "hunk" | "metadata";
  oldNumber?: number;
  newNumber?: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;

export function parseWorkspacePatch(patch: string) {
  let oldNumber = 0;
  let newNumber = 0;
  let oldRemaining = 0;
  let newRemaining = 0;
  let additions = 0;
  let removals = 0;
  const textLines = patch.split(/\r?\n/u);
  if (textLines.at(-1) === "") textLines.pop();
  const lines = textLines.map((text): PatchLine => {
    const hunk = HUNK_HEADER.exec(text);
    if (hunk) {
      oldNumber = Number(hunk[1]);
      oldRemaining = Number(hunk[2] ?? 1);
      newNumber = Number(hunk[3]);
      newRemaining = Number(hunk[4] ?? 1);
      return { kind: "hunk", text };
    }
    if (newRemaining > 0 && text.startsWith("+")) {
      additions++;
      newRemaining--;
      return { kind: "addition", newNumber: newNumber++, text };
    }
    if (oldRemaining > 0 && text.startsWith("-")) {
      removals++;
      oldRemaining--;
      return { kind: "removal", oldNumber: oldNumber++, text };
    }
    if (oldRemaining > 0 && newRemaining > 0 && text.startsWith(" ")) {
      oldRemaining--;
      newRemaining--;
      return {
        kind: "context",
        oldNumber: oldNumber++,
        newNumber: newNumber++,
        text,
      };
    }
    return { kind: "metadata", text };
  });
  return { additions, removals, lines };
}

export function WorkspacePatchView({
  patch,
  path,
  truncated = false,
}: {
  patch: string;
  path?: string;
  truncated?: boolean;
}) {
  const [wrap, setWrap] = useState(false);
  const { additions, removals, lines } = useMemo(
    () => parseWorkspacePatch(patch),
    [patch],
  );

  return (
    <div className="workspace-patch" data-wrap={wrap}>
      <div className="workspace-patch-toolbar">
        <div className="workspace-patch-counts">
          <span className="sr-only">{`${additions} added, ${removals} removed`}</span>
          <span aria-hidden="true" data-kind="addition">
            +{additions}
          </span>
          <span aria-hidden="true" data-kind="removal">
            −{removals}
          </span>
        </div>
        {truncated ? (
          <span className="workspace-patch-partial">Partial patch</span>
        ) : null}
        <div className="workspace-patch-actions">
          <button
            aria-label="Wrap lines"
            aria-pressed={wrap}
            type="button"
            title="Wrap lines"
            onClick={() => setWrap(!wrap)}
          >
            <UiIcon icon={WrapText} size="xs" />
          </button>
          <button
            aria-label="Copy diff"
            type="button"
            title={truncated ? "Copy shown portion of diff" : "Copy diff"}
            onClick={() => void copyContextText(patch)}
          >
            <UiIcon icon={Copy} size="xs" />
          </button>
        </div>
      </div>
      <section
        aria-label="File patch"
        className="workspace-patch-scroll"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The patch must remain keyboard-scrollable on both axes.
        tabIndex={0}
        title={path || undefined}
      >
        <div className="workspace-patch-lines">
          {lines.map(({ kind, oldNumber, newNumber, text }, index) => (
            <div
              className="workspace-patch-row"
              data-kind={kind}
              // A row's position is its address inside this immutable patch.
              // biome-ignore lint/suspicious/noArrayIndexKey: Duplicate lines are common and rows are stateless.
              key={index}
            >
              <span aria-hidden="true" className="workspace-patch-number">
                {oldNumber}
              </span>
              <span aria-hidden="true" className="workspace-patch-number">
                {newNumber}
              </span>
              <code>{text || " "}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
