import { createLogger } from "@elizaos/logger";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { CodeLanguage } from "../code-language";
import {
  APPEARANCE_APPLIED_EVENT,
  loadStoredDesktopTheme,
  parseDesktopThemeProfile,
  THEME_CHANGE_EVENT,
} from "../desktop-theme";
import {
  acquireMonacoProjectSupport,
  setMonacoProjectDiagnosticsPending,
} from "../editor-project-support";
import { doolittleEditorTheme } from "./code-editor-theme";

const DOOLITTLE_EDITOR_THEME = "doolittle-ember";
const editorLogger = createLogger({
  namespace: "doolittle.desktop.code-editor",
  __forceType: "browser",
});

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

function defineDoolittleTheme(
  profile: Parameters<typeof doolittleEditorTheme>[0],
) {
  const appearance =
    document.documentElement.dataset.appearance === "light" ? "light" : "dark";
  monaco.editor.defineTheme(DOOLITTLE_EDITOR_THEME, {
    ...doolittleEditorTheme(profile, appearance),
  });
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

function resolveProjectLanguage(
  language: string,
): "javascript" | "typescript" | null {
  return language === "javascript" || language === "typescript"
    ? language
    : null;
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
  const projectSupportReleaseRef = useRef<(() => void) | null>(null);
  const projectSupportRequestRef = useRef(0);
  const projectRevisionRef = useRef("");
  const [projectSupportRefresh, setProjectSupportRefresh] = useState(0);
  const [projectSupportNotice, setProjectSupportNotice] = useState("");
  const emitChange = useEffectEvent(onChange);
  const emitEditorState = useEffectEvent((snapshot: CodeEditorStateSnapshot) =>
    onEditorStateChange?.(snapshot),
  );
  const emitSave = useEffectEvent(onSave);

  valueRef.current = value;
  disabledRef.current = disabled;
  const supportSignature = projectSupportSignature(value);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !path) return;
    defineDoolittleTheme(loadStoredDesktopTheme());

    const supportLanguage = resolveProjectLanguage(language.id);
    if (workspacePath && supportLanguage) {
      setMonacoProjectDiagnosticsPending(supportLanguage, true);
    }

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
      const cursor = editor.getPosition();
      const selection = editor.getSelection();
      emitEditorState({
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
      if (stateFrame) return;
      stateFrame = requestAnimationFrame(emitState);
    };
    const changeDisposable = model.onDidChangeContent(() => {
      emitChange(model.getValue());
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
      emitSave();
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
      if (supportLanguage) {
        setMonacoProjectDiagnosticsPending(supportLanguage, false);
      }
      editorRef.current = null;
      modelRef.current = null;
    };
  }, [ariaLabel, compact, language.id, path, workspacePath]);

  useEffect(() => {
    const updateTheme = (event: Event) => {
      const profile = parseDesktopThemeProfile(
        (event as CustomEvent<unknown>).detail,
      );
      defineDoolittleTheme(profile ?? loadStoredDesktopTheme());
      monaco.editor.setTheme(DOOLITTLE_EDITOR_THEME);
    };
    const updateAppearance = () => {
      defineDoolittleTheme(loadStoredDesktopTheme());
      monaco.editor.setTheme(DOOLITTLE_EDITOR_THEME);
    };
    window.addEventListener(THEME_CHANGE_EVENT, updateTheme);
    window.addEventListener(APPEARANCE_APPLIED_EVENT, updateAppearance);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, updateTheme);
      window.removeEventListener(APPEARANCE_APPLIED_EVENT, updateAppearance);
    };
  }, []);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is an explicit retry/revision nonce for the same project request.
  useEffect(() => {
    if (
      !workspacePath ||
      !path ||
      (language.id !== "typescript" && language.id !== "javascript")
    ) {
      projectSupportReleaseRef.current?.();
      projectSupportReleaseRef.current = null;
      projectRevisionRef.current = "";
      setProjectSupportNotice("");
      const unsupportedLanguage = resolveProjectLanguage(language.id);
      if (unsupportedLanguage) {
        setMonacoProjectDiagnosticsPending(unsupportedLanguage, false);
      }
      return;
    }

    const projectLanguage = language.id;
    const requestId = projectSupportRequestRef.current + 1;
    projectSupportRequestRef.current = requestId;
    setMonacoProjectDiagnosticsPending(projectLanguage, true);
    const refreshDelay = 0;
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
          projectSupportReleaseRef.current = acquireMonacoProjectSupport(
            context,
            projectLanguage,
          );
          projectRevisionRef.current = context.revision;
          if (context.truncated) {
            setProjectSupportNotice(
              `Project types partial · ${context.supportFiles.length} files · ${(context.supportBytes / 1_000_000).toFixed(1)} MB`,
            );
            editorLogger.warn(
              { context: { path } },
              "Project support was truncated to keep Monaco memory bounded.",
            );
          } else {
            setProjectSupportNotice("");
          }
        })
        .catch((error) => {
          if (projectSupportRequestRef.current !== requestId) return;
          projectSupportReleaseRef.current?.();
          projectSupportReleaseRef.current = null;
          setMonacoProjectDiagnosticsPending(projectLanguage, false);
          setProjectSupportNotice("Project types unavailable");
          editorLogger.warn(
            {
              context: {
                path,
                error: error instanceof Error ? error.message : String(error),
              },
            },
            "Unable to hydrate Monaco project support.",
          );
        });
    }, refreshDelay);

    return () => {
      window.clearTimeout(timer);
      if (projectSupportRequestRef.current === requestId) {
        projectSupportRequestRef.current += 1;
      }
    };
  }, [
    language.id,
    path,
    projectSupportRefresh,
    supportSignature,
    workspacePath,
  ]);

  useEffect(() => {
    if (
      !workspacePath ||
      !path ||
      (language.id !== "typescript" && language.id !== "javascript")
    ) {
      return;
    }
    let active = true;
    let checking = false;
    const checkRevision = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const revision = await window.doolittle.getEditorProjectRevision({
          workspacePath,
          entryPath: path,
        });
        if (
          active &&
          projectRevisionRef.current &&
          revision !== projectRevisionRef.current
        ) {
          projectRevisionRef.current = revision;
          setProjectSupportRefresh((value) => value + 1);
        }
      } catch (error) {
        editorLogger.debug(
          {
            context: {
              path,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          "Unable to check Monaco project support revision.",
        );
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void checkRevision(), 2_500);
    window.addEventListener("focus", checkRevision);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkRevision);
    };
  }, [language.id, path, workspacePath]);

  useEffect(
    () => () => {
      projectSupportReleaseRef.current?.();
      projectSupportReleaseRef.current = null;
    },
    [],
  );

  return (
    <div className="doolittle-code-editor absolute inset-0 min-h-0 min-w-0 overflow-hidden bg-[var(--canvas-bg)]">
      <div
        className="absolute inset-0 [&_.margin]:!bg-[var(--canvas-bg)] [&_.monaco-editor-background]:!bg-[var(--canvas-bg)] [&_.monaco-editor]:!bg-[var(--canvas-bg)] [&_.sticky-widget]:!border-b [&_.sticky-widget]:!border-[var(--canvas-border)] [&_.sticky-widget]:!shadow-[var(--shell-shadow-md)] [&_.monaco-hover]:!rounded-[var(--radius-xs)] [&_.monaco-hover]:!shadow-[var(--shell-shadow-lg)] [&_.suggest-widget]:!rounded-[var(--radius-xs)] [&_.suggest-widget]:!shadow-[var(--shell-shadow-lg)]"
        ref={hostRef}
      />
      {projectSupportNotice ? (
        <div
          className="absolute right-2 bottom-2 z-5 flex min-h-6 items-center gap-2 rounded-[var(--radius-xs)] border border-[var(--canvas-border)] bg-[color-mix(in_srgb,var(--canvas-bg)_94%,var(--canvas-text))] px-2 py-1 font-[var(--font-mono)] text-[length:var(--text-meta)] leading-[var(--line-meta)] text-[var(--canvas-text-soft)] shadow-[var(--shell-shadow-md)]"
          role="status"
        >
          <span>{projectSupportNotice}</span>
          <button
            className="border-0 bg-transparent p-0 font-inherit text-[var(--accent)]"
            onClick={() => setProjectSupportRefresh((value) => value + 1)}
            type="button"
          >
            Reload
          </button>
        </div>
      ) : null}
    </div>
  );
}
