import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";
import { useEffect, useRef } from "react";
import type { CodeLanguage } from "../code-language";
import { acquireMonacoProjectSupport } from "../editor-project-support";
import "./code-editor.css";

const DOOLITTLE_EDITOR_THEME = "doolittle-ember";

const monacoHost = self as typeof self & {
  MonacoEnvironment?: {
    getWorker: (workerId: string, label: string) => Worker;
  };
};

monacoHost.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

let themeDefined = false;

function defineDoolittleTheme() {
  if (themeDefined) return;
  monaco.editor.defineTheme(DOOLITTLE_EDITOR_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "736B64", fontStyle: "italic" },
      { token: "keyword", foreground: "FF711A" },
      { token: "keyword.control", foreground: "FF711A" },
      { token: "type", foreground: "F0A15F" },
      { token: "type.identifier", foreground: "EAAA72" },
      { token: "identifier", foreground: "E9E1DA" },
      { token: "string", foreground: "D9AF72" },
      { token: "number", foreground: "E78B55" },
      { token: "regexp", foreground: "C99162" },
      { token: "delimiter", foreground: "968D85" },
      { token: "tag", foreground: "FF8537" },
      { token: "attribute.name", foreground: "DDA66E" },
      { token: "attribute.value", foreground: "D9AF72" },
    ],
    colors: {
      "editor.background": "#0C0B0A",
      "editor.foreground": "#DCD5CE",
      "editor.lineHighlightBackground": "#171412",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#71351380",
      "editor.inactiveSelectionBackground": "#4D2A1880",
      "editor.selectionHighlightBackground": "#FF711A18",
      "editor.findMatchBackground": "#FF711A55",
      "editor.findMatchHighlightBackground": "#FF711A26",
      "editorCursor.foreground": "#FF711A",
      "editorLineNumber.foreground": "#554E48",
      "editorLineNumber.activeForeground": "#BDB3AA",
      "editorIndentGuide.background1": "#26221F",
      "editorIndentGuide.activeBackground1": "#5B4638",
      "editorBracketMatch.background": "#FF711A18",
      "editorBracketMatch.border": "#FF711A70",
      "editorWhitespace.foreground": "#332E2A",
      "editorGutter.background": "#0C0B0A",
      "editorWidget.background": "#171411",
      "editorWidget.border": "#342D28",
      "editorSuggestWidget.background": "#171411",
      "editorSuggestWidget.border": "#342D28",
      "editorSuggestWidget.selectedBackground": "#2B211A",
      "editorHoverWidget.background": "#171411",
      "editorHoverWidget.border": "#342D28",
      "minimap.background": "#0C0B0A",
      "minimap.selectionHighlight": "#FF711A45",
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#6B5D5345",
      "scrollbarSlider.hoverBackground": "#8C796B65",
      "scrollbarSlider.activeBackground": "#FF711A65",
    },
  });
  themeDefined = true;
}

function modelUri(path: string, workspacePath?: string): monaco.Uri {
  const normalizedPath = path.replace(/\\/gu, "/").replace(/^\/+/u, "");
  const normalizedWorkspace = workspacePath
    ?.replace(/\\/gu, "/")
    .replace(/\/+$/u, "");
  const absolutePath = normalizedWorkspace
    ? `${normalizedWorkspace}/${normalizedPath || "untitled.txt"}`
    : `/${normalizedPath || "untitled.txt"}`;
  return monaco.Uri.file(absolutePath);
}

function projectSupportSignature(content: string): string {
  return content
    .split("\n")
    .filter((line) =>
      /^\s*(?:import|export)\b|\bfrom\s*["']|\brequire\s*\(|\bimport\s*\(|<reference\s/u.test(
        line,
      ),
    )
    .join("\n");
}

export interface CodeEditorPosition {
  line: number;
  column: number;
}

export interface CodeEditorSelection {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  text: string;
}

export interface CodeEditorVisibleRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CodeEditorStateSnapshot {
  path: string;
  uri: string;
  language: string;
  content: string;
  version: number;
  focused: boolean;
  cursor?: CodeEditorPosition;
  selection?: CodeEditorSelection;
  visibleRanges: CodeEditorVisibleRange[];
}

export function CodeEditor({
  ariaLabel,
  compact = false,
  disabled,
  language,
  onChange,
  onEditorStateChange,
  onSave,
  path,
  value,
  workspacePath,
}: {
  ariaLabel?: string;
  compact?: boolean;
  disabled: boolean;
  language: CodeLanguage;
  onChange: (value: string) => void;
  onEditorStateChange?: (snapshot: CodeEditorStateSnapshot) => void;
  onSave: () => void;
  path: string;
  value: string;
  workspacePath?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const valueRef = useRef(value);
  const disabledRef = useRef(disabled);
  const onChangeRef = useRef(onChange);
  const onEditorStateChangeRef = useRef(onEditorStateChange);
  const onSaveRef = useRef(onSave);
  const projectSupportReleaseRef = useRef<(() => void) | null>(null);
  const projectSupportRequestRef = useRef(0);

  valueRef.current = value;
  disabledRef.current = disabled;
  onChangeRef.current = onChange;
  onEditorStateChangeRef.current = onEditorStateChange;
  onSaveRef.current = onSave;
  const supportSignature = projectSupportSignature(value);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !path) return;
    defineDoolittleTheme();

    const uri = modelUri(path, workspacePath);
    monaco.editor.getModel(uri)?.dispose();
    const model = monaco.editor.createModel(valueRef.current, language.id, uri);
    const editor = monaco.editor.create(host, {
      model,
      theme: DOOLITTLE_EDITOR_THEME,
      ariaLabel: ariaLabel ?? `Edit ${path}`,
      automaticLayout: true,
      bracketPairColorization: { enabled: true },
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      fontFamily: "var(--font-mono)",
      fontLigatures: true,
      fontSize: compact ? 11 : 12,
      folding: true,
      foldingHighlight: true,
      glyphMargin: false,
      guides: {
        bracketPairs: true,
        indentation: true,
      },
      lineDecorationsWidth: compact ? 6 : 10,
      lineHeight: compact ? 18 : 20,
      lineNumbersMinChars: compact ? 2 : 3,
      minimap: {
        enabled: !compact,
        maxColumn: 90,
        renderCharacters: false,
        scale: 1,
        showSlider: "mouseover",
      },
      padding: compact ? { top: 8, bottom: 16 } : { top: 12, bottom: 32 },
      readOnly: disabledRef.current,
      domReadOnly: disabledRef.current,
      renderLineHighlight: "line",
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      stickyScroll: { enabled: true, maxLineCount: compact ? 2 : 4 },
      tabSize: 2,
      wordWrap: "off",
    });

    let stateFrame = 0;
    const emitState = () => {
      stateFrame = 0;
      const callback = onEditorStateChangeRef.current;
      if (!callback) return;
      const cursor = editor.getPosition();
      const selection = editor.getSelection();
      callback({
        path,
        uri: uri.toString(),
        language: language.id,
        content: model.getValue(),
        version: model.getVersionId(),
        focused: editor.hasTextFocus(),
        cursor: cursor
          ? { line: cursor.lineNumber, column: cursor.column }
          : undefined,
        selection:
          selection && !selection.isEmpty()
            ? {
                startLine: selection.startLineNumber,
                startColumn: selection.startColumn,
                endLine: selection.endLineNumber,
                endColumn: selection.endColumn,
                text: model.getValueInRange(selection),
              }
            : undefined,
        visibleRanges: editor.getVisibleRanges().map((range) => ({
          startLine: range.startLineNumber,
          startColumn: range.startColumn,
          endLine: range.endLineNumber,
          endColumn: range.endColumn,
        })),
      });
    };
    const scheduleState = () => {
      if (!onEditorStateChangeRef.current || stateFrame) return;
      stateFrame = requestAnimationFrame(emitState);
    };
    const changeDisposable = model.onDidChangeContent(() => {
      onChangeRef.current(model.getValue());
      scheduleState();
    });
    const stateDisposables = [
      editor.onDidChangeCursorPosition(scheduleState),
      editor.onDidChangeCursorSelection(scheduleState),
      editor.onDidFocusEditorText(scheduleState),
      editor.onDidBlurEditorText(scheduleState),
      editor.onDidScrollChange(scheduleState),
    ];
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current();
    });
    editorRef.current = editor;
    modelRef.current = model;
    scheduleState();

    return () => {
      if (stateFrame) cancelAnimationFrame(stateFrame);
      changeDisposable.dispose();
      for (const disposable of stateDisposables) disposable.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
      modelRef.current = null;
    };
  }, [ariaLabel, compact, language.id, path, workspacePath]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ readOnly: disabled, domReadOnly: disabled });
  }, [disabled]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || model.getValue() === value) return;
    model.setValue(value);
  }, [value]);

  useEffect(() => {
    if (
      !workspacePath ||
      !path ||
      (language.id !== "typescript" && language.id !== "javascript")
    ) {
      projectSupportReleaseRef.current?.();
      projectSupportReleaseRef.current = null;
      return;
    }

    const requestId = projectSupportRequestRef.current + 1;
    projectSupportRequestRef.current = requestId;
    const timer = window.setTimeout(() => {
      const content = valueRef.current;
      if (projectSupportSignature(content) !== supportSignature) return;
      void window.doolittle
        .getEditorProjectContext({
          workspacePath,
          entryPath: path,
          content,
        })
        .then((context) => {
          if (projectSupportRequestRef.current !== requestId) return;
          projectSupportReleaseRef.current?.();
          projectSupportReleaseRef.current =
            acquireMonacoProjectSupport(context);
          if (context.truncated) {
            console.warn(
              `[CodeEditor] Project support for ${path} was truncated to keep Monaco memory bounded.`,
            );
          }
        })
        .catch((error) => {
          if (projectSupportRequestRef.current !== requestId) return;
          projectSupportReleaseRef.current?.();
          projectSupportReleaseRef.current = null;
          console.warn(
            `[CodeEditor] Unable to hydrate Monaco project support for ${path}.`,
            error,
          );
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      if (projectSupportRequestRef.current === requestId) {
        projectSupportRequestRef.current += 1;
      }
    };
  }, [language.id, path, supportSignature, workspacePath]);

  useEffect(
    () => () => {
      projectSupportReleaseRef.current?.();
      projectSupportReleaseRef.current = null;
    },
    [],
  );

  return <div className="doolittle-code-editor" ref={hostRef} />;
}
