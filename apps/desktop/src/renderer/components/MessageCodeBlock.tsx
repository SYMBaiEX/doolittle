import {
  Braces,
  Clipboard,
  Maximize2,
  Minimize2,
  WrapText,
} from "lucide-react";
import {
  type ComponentProps,
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useState,
} from "react";
import { defaultComponents, useIsCodeFenceIncomplete } from "streamdown";
import { copyContextText } from "../context-menu-clipboard";
import type { CodeToken } from "./message-code-highlight";

const LANGUAGE_ALIASES: Record<string, string> = {
  console: "bash",
  golang: "go",
  html5: "html",
  js: "javascript",
  patch: "diff",
  py: "python",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  ts: "typescript",
  yml: "yaml",
  zsh: "bash",
};

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Shell",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  html: "HTML",
  javascript: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  plaintext: "Text",
  python: "Python",
  rust: "Rust",
  sql: "SQL",
  text: "Text",
  tsx: "TSX",
  txt: "Text",
  typescript: "TypeScript",
  yaml: "YAML",
};

function lookup(record: Record<string, string>, key: string) {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

type MarkdownCodeProps = ComponentProps<typeof defaultComponents.code> & {
  "data-block"?: string;
};

export function MessageMarkdownCode(props: MarkdownCodeProps) {
  if (!props["data-block"]) return <defaultComponents.code {...props} />;

  const { children, className, node } = props;
  const source =
    typeof children === "string"
      ? children
      : isValidElement<{ children?: unknown }>(children) &&
          typeof children.props.children === "string"
        ? children.props.children
        : "";
  // CommonMark appends one synthetic end-of-block newline. Keep all authored
  // spaces and blank lines instead of trimming the block before copying.
  const code = source.endsWith("\n") ? source.slice(0, -1) : source;
  const fenceLanguage = className?.match(/\blanguage-([^\s]+)/u)?.[1] ?? "text";
  const language =
    lookup(LANGUAGE_ALIASES, fenceLanguage.toLowerCase()) ??
    fenceLanguage.toLowerCase();
  const label = lookup(LANGUAGE_LABELS, language) ?? fenceLanguage.slice(0, 36);
  const metadata = node?.properties.metastring;
  const meta = typeof metadata === "string" ? metadata : "";
  const name = meta.match(
    /(?:^|\s)(?:filename|file|title)=(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s]+))/u,
  );
  const filename = (name?.[1] ?? name?.[2] ?? name?.[3] ?? "")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim()
    .slice(0, 180);
  const rawStartLine = Number(
    meta.match(/(?:^|\s)startLine=(\d+)(?:\s|$)/u)?.[1],
  );
  const startLine =
    rawStartLine > 0 && Number.isSafeInteger(rawStartLine) ? rawStartLine : 1;

  return (
    <MessageCodeBlock
      code={code}
      filename={filename}
      label={label}
      language={language}
      lineNumbers={
        label !== "Text" &&
        language !== "bash" &&
        language !== "diff" &&
        !/\bnoLineNumbers\b/u.test(meta)
      }
      startLine={startLine}
    />
  );
}

function patchLine(line: string) {
  if (/^(?:@@|diff --git |index |---\s|\+\+\+\s)/u.test(line)) return "header";
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
}

function MessageCodeBlock({
  code,
  filename,
  label,
  language,
  lineNumbers,
  startLine,
}: {
  code: string;
  filename: string;
  label: string;
  language: string;
  lineNumbers: boolean;
  startLine: number;
}) {
  const incomplete = useIsCodeFenceIncomplete();
  const [wrap, setWrap] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [highlight, setHighlight] = useState<{
    source: string;
    language: string;
    lines: CodeToken[][];
  }>();
  const lines = useMemo(() => code.split("\n"), [code]);
  const isDiff = language === "diff";
  const changes = useMemo(() => {
    if (!isDiff) return undefined;
    let added = 0;
    let removed = 0;
    for (const line of lines) {
      const change = patchLine(line);
      if (change === "added") added++;
      if (change === "removed") removed++;
    }
    return { added, removed };
  }, [isDiff, lines]);

  useEffect(() => {
    // Keep streaming and unusually large snippets responsive. Plain text is
    // immediately available, including while the grammar loads or if it fails.
    if (
      incomplete ||
      label === "Text" ||
      isDiff ||
      !code ||
      code.length > 24_000 ||
      lines.some((line) => line.length > 1_600)
    )
      return;
    let active = true;
    void import("./message-code-highlight")
      .then(({ highlightMessageCode }) => highlightMessageCode(code, language))
      .then((highlighted) => {
        if (active && highlighted)
          setHighlight({ source: code, language, lines: highlighted });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [code, incomplete, isDiff, label, language, lines]);

  const tokens =
    !incomplete && highlight?.source === code && highlight.language === language
      ? highlight.lines
      : undefined;
  const title = filename || label;
  return (
    <figure
      aria-label={title}
      className="message-code"
      data-language={language}
    >
      <figcaption className="message-code-header">
        <Braces aria-hidden="true" size={14} />
        <div className="message-code-caption">
          {filename ? (
            <span className="message-code-filename" title={filename}>
              {filename}
            </span>
          ) : null}
          <span className="message-code-language">{label}</span>
          {changes && (changes.added > 0 || changes.removed > 0) ? (
            <span className="message-code-counts">
              <span aria-hidden="true">+{changes.added}</span>
              <span aria-hidden="true">−{changes.removed}</span>
              <span className="sr-only">
                {changes.added} additions, {changes.removed} deletions
              </span>
            </span>
          ) : null}
          {incomplete ? (
            <span className="message-code-streaming">Streaming</span>
          ) : null}
        </div>
        <div className="message-code-actions">
          {lines.length > 20 ? (
            <button
              aria-label={expanded ? "Limit code height" : "Expand code"}
              onClick={() => setExpanded((current) => !current)}
              title={expanded ? "Limit code height" : "Expand code"}
              type="button"
            >
              {expanded ? (
                <Minimize2 aria-hidden="true" size={14} />
              ) : (
                <Maximize2 aria-hidden="true" size={14} />
              )}
            </button>
          ) : null}
          <button
            aria-label="Wrap lines"
            aria-pressed={wrap}
            onClick={() => setWrap((current) => !current)}
            title="Wrap lines"
            type="button"
          >
            <WrapText aria-hidden="true" size={15} />
          </button>
          <button
            aria-label="Copy code"
            disabled={!code}
            onClick={() => void copyContextText(code)}
            title="Copy code"
            type="button"
          >
            <Clipboard aria-hidden="true" size={14} />
          </button>
        </div>
      </figcaption>
      <section
        aria-label={`${title} code`}
        className="message-code-scroll"
        data-expanded={expanded || undefined}
        data-line-numbers={lineNumbers && code.length > 0 ? true : undefined}
        data-wrapped={wrap || undefined}
        dir="ltr"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to focus and scroll both axes of long source blocks.
        tabIndex={0}
      >
        <pre>
          <code>
            {lines.map((line, index) => {
              const number = startLine + index;
              const highlighted = tokens?.[index];
              return (
                <Fragment key={number}>
                  {index > 0 ? "\n" : null}
                  <span
                    className="message-code-line"
                    data-code-change={isDiff ? patchLine(line) : undefined}
                  >
                    {lineNumbers && code ? (
                      <span
                        aria-hidden="true"
                        className="message-code-number"
                        data-number={number}
                      />
                    ) : null}
                    {highlighted?.map(({ role, text }, tokenIndex) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: Token positions identify spans within a source line.
                      <span data-code-token={role} key={tokenIndex}>
                        {text}
                      </span>
                    )) ?? line}
                  </span>
                </Fragment>
              );
            })}
          </code>
        </pre>
      </section>
    </figure>
  );
}
