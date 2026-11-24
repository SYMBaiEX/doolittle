import { createLogger } from "@elizaos/logger";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import type { CodeLanguage } from "../code-language";
import {
  APPEARANCE_APPLIED_EVENT,
  loadStoredDesktopTheme,
  parseDesktopThemeProfile,
  THEME_CHANGE_EVENT,
} from "../desktop-theme";
import { editorModelQuery } from "../editor-model-identity";
import {
  acquireMonacoProjectDiagnosticsLease,
  acquireMonacoProjectSupport,
} from "../editor-project-support";
import { doolittleEditorTheme } from "./code-editor-theme";

const DOOLITTLE_EDITOR_THEME = "doolittle-ember";
const MINIMAP_MIN_WIDTH = 720;
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

function modelUri(
  path: string,
  workspacePath: string | undefined,
  instanceId: string,
  botId?: string,
  originConversationId?: string,
): monaco.Uri {
  const normalizedPath = path.replace(/\\/gu, "/").replace(/^\/+/u, "");
  const normalizedWorkspace = workspacePath
    ?.replace(/\\/gu, "/")
    .replace(/\/+$/u, "");
  const absolutePath = normalizedWorkspace
    ? `${normalizedWorkspace}/${normalizedPath || "untitled.txt"}`
    : `/${normalizedPath || "untitled.txt"}`;
  return monaco.Uri.file(absolutePath).with({
    query: editorModelQuery(path, instanceId, botId, originConversationId),
  });
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

export type CodeEditorViewState = monaco.editor.ICodeEditorViewState;

export function CodeEditor({
  active = true,
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
  botId,
  originConversationId,
  wordWrap = false,
  viewState,
}: {
  active?: boolean;
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
  botId?: string;
  originConversationId?: string;
  /** Wrap long lines at the editor edge; off keeps horizontal scrolling. */
  wordWrap?: boolean;
  /** A per-workspace cache indexed by the immutable document identity. */
  viewState?: { key: string; cache: Map<string, CodeEditorViewState> };
}) {
  const modelInstanceId = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const valueRef = useRef(value);
  const disabledRef = useRef(disabled);
  const wordWrapRef = useRef(wordWrap);
  const projectDiagnosticsReleaseRef = useRef<(() => void) | null>(null);
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
  wordWrapRef.current = wordWrap;
  const supportSignature = projectSupportSignature(value);
  const viewStateCache = viewState?.cache;
  const viewStateKey = viewState?.key;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !path) return;
    defineDoolittleTheme(loadStoredDesktopTheme());

    const supportLanguage = resolveProjectLanguage(language.id);
    if (supportLanguage) {
      projectDiagnosticsReleaseRef.current?.();
      projectDiagnosticsReleaseRef.current =
        acquireMonacoProjectDiagnosticsLease(supportLanguage);
    }

    // A read-only preview and a full editor can remain mounted simultaneously.
    // Each view owns its model; never dispose another live editor's document.
    const uri = modelUri(
      path,
      workspacePath,
      modelInstanceId,
      botId,
      originConversationId,
    );
    const model = monaco.editor.createModel(valueRef.current, language.id, uri);
    let minimapVisible = !compact && host.clientWidth >= MINIMAP_MIN_WIDTH;
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
      fontSize: compact ? 11 : 13,
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
        enabled: minimapVisible,
        maxColumn: 90,
        renderCharacters: false,
        scale: 1,
        showSlider: "mouseover",
      },
      padding: compact ? { top: 8, bottom: 16 } : { top: 8, bottom: 20 },
      readOnly: disabledRef.current,
      domReadOnly: disabledRef.current,
      renderLineHighlight: "line",
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      stickyScroll: { enabled: true, maxLineCount: compact ? 2 : 4 },
      tabSize: 2,
      wordWrap: wordWrapRef.current ? "on" : "off",
    });
    const previousViewState = viewStateKey
      ? viewStateCache?.get(viewStateKey)
      : undefined;
    if (previousViewState) editor.restoreViewState(previousViewState);

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
      editor.onDidLayoutChange(({ width }) => {
        const visible = !compact && width >= MINIMAP_MIN_WIDTH;
        if (minimapVisible === visible) return;
        minimapVisible = visible;
        editor.updateOptions({ minimap: { enabled: visible } });
      }),
    ];
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (!disabledRef.current) emitSave();
    });
    editorRef.current = editor;
    modelRef.current = model;
    scheduleState();

    return () => {
      const latestViewState = viewStateKey ? editor.saveViewState() : null;
      if (viewStateKey && latestViewState)
        viewStateCache?.set(viewStateKey, latestViewState);
      if (stateFrame) cancelAnimationFrame(stateFrame);
      changeDisposable.dispose();
      for (const disposable of stateDisposables) disposable.dispose();
      editor.dispose();
      model.dispose();
      projectDiagnosticsReleaseRef.current?.();
      projectDiagnosticsReleaseRef.current = null;
      editorRef.current = null;
      modelRef.current = null;
    };
  }, [
    ariaLabel,
    compact,
    language.id,
    path,
    workspacePath,
    modelInstanceId,
    botId,
    originConversationId,
    viewStateCache,
    viewStateKey,
  ]);

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
    editorRef.current?.updateOptions({
      wordWrap: wordWrap ? "on" : "off",
    });
  }, [wordWrap]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || model.getValue() === value) return;
    model.setValue(value);
  }, [value]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is an explicit retry/revision nonce for the same project request.
  useEffect(() => {
    if (!active) return;
    if (
      !workspacePath ||
      !path ||
      (language.id !== "typescript" && language.id !== "javascript")
    ) {
      projectSupportReleaseRef.current?.();
      projectSupportReleaseRef.current = null;
      projectRevisionRef.current = "";
      setProjectSupportNotice("");
      projectDiagnosticsReleaseRef.current?.();
      projectDiagnosticsReleaseRef.current = null;
      return;
    }

    const projectLanguage = language.id;
    const requestId = projectSupportRequestRef.current + 1;
    projectSupportRequestRef.current = requestId;
    if (!projectDiagnosticsReleaseRef.current) {
      projectDiagnosticsReleaseRef.current =
        acquireMonacoProjectDiagnosticsLease(projectLanguage);
    }
    projectSupportReleaseRef.current?.();
    projectSupportReleaseRef.current = null;
    projectRevisionRef.current = "";
    const refreshDelay = 0;
    const timer = window.setTimeout(() => {
      const content = valueRef.current;
      if (projectSupportSignature(content) !== supportSignature) return;
      void window.doolittle
        .getEditorProjectContext({
          botId,
          originConversationId,
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
          projectDiagnosticsReleaseRef.current?.();
          projectDiagnosticsReleaseRef.current = null;
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
          projectDiagnosticsReleaseRef.current?.();
          projectDiagnosticsReleaseRef.current = null;
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
    active,
    language.id,
    path,
    projectSupportRefresh,
    supportSignature,
    workspacePath,
    botId,
    originConversationId,
  ]);

  useEffect(() => {
    if (
      !active ||
      !workspacePath ||
      !path ||
      (language.id !== "typescript" && language.id !== "javascript")
    ) {
      return;
    }
    let current = true;
    let checking = false;
    const checkRevision = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const revision = await window.doolittle.getEditorProjectRevision({
          botId,
          originConversationId,
          workspacePath,
          entryPath: path,
        });
        if (
          current &&
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
      current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkRevision);
    };
  }, [active, language.id, path, workspacePath, botId, originConversationId]);

  useEffect(
    () => () => {
      projectSupportReleaseRef.current?.();
      projectSupportReleaseRef.current = null;
    },
    [],
  );

  return (
    <div className="doolittle-code-editor absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--canvas-bg)]">
      <div
        className="relative min-h-0 min-w-0 flex-1 [&_.margin]:!bg-[var(--canvas-bg)] [&_.monaco-editor-background]:!bg-[var(--canvas-bg)] [&_.monaco-editor]:!bg-[var(--canvas-bg)] [&_.sticky-widget]:!border-0 [&_.sticky-widget]:!shadow-[var(--shell-shadow-md)] [&_.monaco-hover]:!rounded-[var(--radius-xs)] [&_.monaco-hover]:!shadow-[var(--shell-shadow-lg)] [&_.suggest-widget]:!rounded-[var(--radius-xs)] [&_.suggest-widget]:!shadow-[var(--shell-shadow-lg)]"
        ref={hostRef}
      />
      {projectSupportNotice ? (
        <div className="flex min-h-7 min-w-0 shrink-0 items-center justify-end gap-2 bg-[var(--surface-soft)] px-3 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--canvas-text-soft)]">
          <span className="truncate" role="status" title={projectSupportNotice}>
            {projectSupportNotice}
          </span>
          <button
            aria-label="Reload project types"
            className="min-h-6 shrink-0 rounded-[var(--radius-xs)] border-0 bg-transparent px-1.5 text-[var(--accent-text)] hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]"
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
