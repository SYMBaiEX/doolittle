import type { ReactNode } from "react";

type BlockType = "paragraph" | "code" | "list";

interface MessageBlock {
  type: BlockType;
  text: string;
  listType?: "ordered" | "unordered";
  lines?: string[];
}

function isAllowedLink(
  value: string,
): value is `http://${string}` | `https://${string}` {
  return /^https?:\/\//i.test(value);
}

function renderTextSegment(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let offset = 0;
  let match = pattern.exec(value);
  let index = 0;

  while (match) {
    if (match.index > offset) {
      const segment = value.slice(offset, match.index);
      const lines = segment.split("\n");
      let lineOffset = 0;
      nodes.push(
        ...lines.flatMap((line) => {
          const fragments: ReactNode[] = [];
          if (line.length > 0) {
            fragments.push(line);
          }
          const currentOffset = lineOffset;
          lineOffset += line.length + 1;
          if (currentOffset < segment.length - line.length) {
            fragments.push(
              <br
                key={`${keyPrefix}-br-${index}-${currentOffset}`}
                aria-hidden="true"
              />,
            );
          }
          return fragments;
        }),
      );
    }

    if (match[0].startsWith("`")) {
      nodes.push(
        <code key={`${keyPrefix}-code-${index}`}>{match[1] ?? ""}</code>,
      );
    } else {
      const label = match[2] ?? "";
      const href = match[3] ?? "";
      if (isAllowedLink(href)) {
        nodes.push(
          <a
            href={href}
            key={`${keyPrefix}-link-${index}`}
            rel="noreferrer"
            target="_blank"
          >
            {label || href}
          </a>,
        );
      } else {
        nodes.push(
          <span key={`${keyPrefix}-disallowed-${index}`}>
            [{label}]({href})
          </span>,
        );
      }
    }

    offset = match.index + match[0].length;
    match = pattern.exec(value);
    index += 1;
  }

  if (offset < value.length) {
    const segment = value.slice(offset);
    const lines = segment.split("\n");
    let lineOffset = 0;
    nodes.push(
      ...lines.flatMap((line) => {
        const fragments: ReactNode[] = [];
        if (line.length > 0) {
          fragments.push(line);
        }
        const currentOffset = lineOffset;
        lineOffset += line.length + 1;
        if (currentOffset < segment.length - line.length) {
          fragments.push(
            <br
              key={`${keyPrefix}-tail-br-${currentOffset}`}
              aria-hidden="true"
            />,
          );
        }
        return fragments;
      }),
    );
  }

  return nodes;
}

function parseMessageBlocks(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const lines = content.split(/\r?\n/);
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line.startsWith("```")) {
      cursor += 1;
      const codeLines: string[] = [];
      while (cursor < lines.length && !lines[cursor].startsWith("```")) {
        codeLines.push(lines[cursor]);
        cursor += 1;
      }
      if (cursor < lines.length && lines[cursor].startsWith("```")) {
        cursor += 1;
      }
      blocks.push({
        type: "code",
        text: codeLines.join("\n"),
      });
      continue;
    }

    const listMatch = line.match(/^(\s*)(?:-|\*|\+|\d+\.)\s+(.*?)(?:\s*)$/);
    if (listMatch) {
      const current = line.match(/^\s*(\d+\.|-|\+|\*)\s+(.*?)(?:\s*)$/u);
      const firstLine = current?.[2] ?? "";
      const ordered = Boolean(current?.[1]?.match(/^\d+\.$/u));
      const linesInList: string[] = [firstLine];
      cursor += 1;
      while (cursor < lines.length) {
        const next = lines[cursor].match(
          /^\s*(\d+\.|-|\+|\*)\s+(.*?)(?:\s*)$/u,
        );
        if (!next) break;
        linesInList.push(next[2] ?? "");
        cursor += 1;
      }
      blocks.push({
        type: "list",
        listType: ordered ? "ordered" : "unordered",
        lines: linesInList,
        text: "",
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (cursor < lines.length && lines[cursor].trim() !== "") {
      const current = lines[cursor];
      if (current.startsWith("```")) break;
      if (current.match(/^\s*(\d+\.|-|\+|\*)\s+/u)) break;
      paragraphLines.push(current);
      cursor += 1;
    }
    while (cursor < lines.length && lines[cursor].trim() === "") {
      cursor += 1;
    }
    const text = paragraphLines.join("\n").trim();
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
  }

  return blocks;
}

export function MessageContent({ content }: { content: string }) {
  const blocks = parseMessageBlocks(content);
  const blockKeyCounts = new Map<string, number>();
  return (
    <div className="message-content">
      {blocks.length === 0 ? (
        <p>
          <span className="thinking">Empty</span>
        </p>
      ) : (
        blocks.map((block) => {
          const blockBaseKey =
            block.type === "list"
              ? `${block.type}:${block.listType}:${block.lines?.join("\n") ?? ""}`
              : `${block.type}:${block.text}`;
          const blockOccurrence = blockKeyCounts.get(blockBaseKey) ?? 0;
          blockKeyCounts.set(blockBaseKey, blockOccurrence + 1);
          const blockKey = `${blockBaseKey}:${blockOccurrence}`;

          if (block.type === "code") {
            return (
              <pre className="message-content__code" key={blockKey}>
                <code>{block.text}</code>
              </pre>
            );
          }
          if (block.type === "list") {
            const entryKeyCounts = new Map<string, number>();
            const entries =
              block.lines?.map((entry) => {
                const occurrence = entryKeyCounts.get(entry) ?? 0;
                entryKeyCounts.set(entry, occurrence + 1);
                const entryKey = `${blockKey}:${entry}:${occurrence}`;
                return (
                  <li key={entryKey}>{renderTextSegment(entry, entryKey)}</li>
                );
              }) ?? [];
            return block.listType === "ordered" ? (
              <ol
                className="message-content__list message-content__list--ordered"
                key={blockKey}
              >
                {entries}
              </ol>
            ) : (
              <ul
                className="message-content__list message-content__list--unordered"
                key={blockKey}
              >
                {entries}
              </ul>
            );
          }
          return (
            <p className="message-content__paragraph" key={blockKey}>
              {renderTextSegment(block.text, blockKey)}
            </p>
          );
        })
      )}
    </div>
  );
}
