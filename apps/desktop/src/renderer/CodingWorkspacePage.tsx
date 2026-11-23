import type { RepositoryMutationRequest } from "@doolittle/contracts/repository";
import { Minimize2, X } from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WorkspacePickResult } from "../shared/contracts";
import type { CodingWorkspaceFocusState } from "./app-shell/route-focus-state";
import { BrowserPage } from "./BrowserPage";
import type { ChatContextRequest } from "./chat-context-handoff";
import { detectCodeLanguage } from "./code-language";
import { submitAcpEditorTask } from "./coding-workspace/acp-task";
import { CodingWorkspaceEditor } from "./coding-workspace/CodingWorkspaceEditor";
import { CodingWorkspaceExplorer } from "./coding-workspace/CodingWorkspaceExplorer";
import type { CodeSurface } from "./coding-workspace/CodingWorkspaceHeader";
import { CodingWorkspaceHeader } from "./coding-workspace/CodingWorkspaceHeader";
import { CodingWorkspaceUtility } from "./coding-workspace/CodingWorkspaceUtility";
import {
  CODING_LAYOUT_BUTTON_CLASS,
  CODING_PANE_DISMISS_CLASS,
  CODING_WORKSPACE_PAGE_CLASS,
  codingGridClass,
} from "./coding-workspace/layout";
import {
  type ActionNotice,
  boundedContext,
  commitRows,
  type EditorPane,
  EMPTY_SUMMARY,
  type LeftPane,
  type RepositoryLogResponse,
  type RepositorySummaryResponse,
  toChanges,
  toSearchResult,
  type UtilityPane,
  type WorkspaceReadResponse,
  type WorkspaceSearchResponse,
  type WorkspaceTreeResponse,
} from "./coding-workspace/models";
import type { CodeEditorStateSnapshot } from "./components/CodeEditor";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { UiIcon } from "./components/UiIcon";
import type { ComputerOrigin } from "./computer-origin";
import { useDesktopAcpEditorBridge } from "./desktop-acp-client";
import type { DesktopNavigationIntent } from "./desktop-navigation-intent";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  EmptyBlock,
  errorMessage,
  PageHeader,
} from "./lib";
import type { ProjectScope } from "./project-manager/models";
import { codingWorkspaceRequests } from "./resource-request-policy";
import {
  codeWorkspaceDockFit,
  codeWorkspaceWidthBudget,
  loadCodeWorkspaceLayout,
  resizeCodeWorkspaceWidths,
  saveCodeWorkspaceLayout,
} from "./workspace-layout-state";

import {
  publishWorkspaceFileSave,
  refreshWorkspaceResources,
  useRepositoryPatch,
  useRepositoryResources,
  useWorkspaceResource,
  workspaceMutationRequest,
} from "./workspace-resources";

type SidePane = "explorer" | "utility";
type FileEdit = { baseline: string; content: string };

function paneToggleSelector(pane: SidePane) {
  return `[data-code-pane-toggle="${pane}"]`;
}

export function CodingWorkspacePage({
  active,
  visible = active,
  canCreateWorktree,
  editingLocked,
  navigationIntent,
  onAcknowledgeNavigationIntent,
  onChooseWorkspace,
  onOpenWorkspacePath,
  onOpenChatTerminal,
  terminalOpen = false,
  onSendToChat,
  onDirtyChange,
  previewEvidenceAvailable,
  focusState,
  onFocusStateChange,
  projectScope,
  surface,
  onSurfaceChange,
  origin: resourceOrigin,
}: {
  active: boolean;
  visible?: boolean;
  canCreateWorktree: boolean;
  editingLocked: boolean;
  navigationIntent: DesktopNavigationIntent | null;
  onAcknowledgeNavigationIntent: (id: string) => void;
  onChooseWorkspace: (
    hasUnsavedChanges?: boolean,
  ) => Promise<WorkspacePickResult>;
  onOpenWorkspacePath: (
    path: string,
    hasUnsavedChanges?: boolean,
  ) => Promise<WorkspacePickResult>;
  onOpenChatTerminal: () => void;
  terminalOpen?: boolean;
  onSendToChat: (request: ChatContextRequest) => Promise<boolean>;
  onDirtyChange?: (dirty: boolean) => void;
  previewEvidenceAvailable: boolean;
  focusState?: CodingWorkspaceFocusState;
  onFocusStateChange?: (state: CodingWorkspaceFocusState) => void;
  projectScope: ProjectScope;
  surface: CodeSurface;
  onSurfaceChange: (surface: CodeSurface) => void;
  origin: ComputerOrigin;
}) {
  const { botId, originConversationId, workspacePath } = resourceOrigin;
  // DesktopRouteContent keys this editor by its workspace and conversation owner.
  const [layout, setLayout] = useState(() =>
    loadCodeWorkspaceLayout(localStorage, workspacePath),
  );
  const { zenMode } = layout;
  const workspacePageRef = useRef<HTMLDivElement>(null);
  const codeGridRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [codeGridWidth, setCodeGridWidth] = useState(0);
  const [overlayPane, setOverlayPane] = useState<SidePane | null>(null);
  const { explorer: explorerFits, utility: utilityFits } = codeWorkspaceDockFit(
    codeGridWidth,
    layout.explorerVisible,
  );
  const activeOverlay =
    !zenMode && surface === "workspace" ? overlayPane : null;
  const explorerDocked = !zenMode && explorerFits && layout.explorerVisible;
  const utilityDocked = !zenMode && utilityFits && layout.utilityVisible;
  const explorerVisible = explorerDocked || activeOverlay === "explorer";
  const utilityVisible = utilityDocked || activeOverlay === "utility";
  const [leftPane, setLeftPane] = useState<LeftPane>(
    () => focusState?.leftPane ?? "files",
  );
  const [editorPane, setEditorPane] = useState<EditorPane>(
    () => focusState?.editorPane ?? "file",
  );
  const [utilityPane, setUtilityPane] = useState<UtilityPane>(
    () => focusState?.utilityPane ?? "source-control",
  );
  const [selectedPath, setSelectedPath] = useState(
    () => focusState?.selectedPath ?? "",
  );
  const [openDocumentPaths, setOpenDocumentPaths] = useState<string[]>(
    () => focusState?.openDocumentPaths ?? (selectedPath ? [selectedPath] : []),
  );
  const initializedDocuments = useRef(
    Boolean(focusState?.openDocumentPaths || selectedPath),
  );
  const [stagedPatch, setStagedPatch] = useState(false);
  const [searchDraft, setSearchDraft] = useState(
    () => focusState?.searchDraft ?? "",
  );
  const [searchQuery, setSearchQuery] = useState(
    () => focusState?.searchQuery ?? "",
  );
  const [fileEdits, setFileEdits] = useState<ReadonlyMap<string, FileEdit>>(
    () => new Map(),
  );
  const [fileNotices, setFileNotices] = useState<
    ReadonlyMap<string, ActionNotice>
  >(() => new Map());
  const fileNotice = fileNotices.get(selectedPath) ?? null;
  const setFileNotice = (notice: ActionNotice | null) => {
    setFileNotices((current) => {
      if (!notice && !current.has(selectedPath)) return current;
      const next = new Map(current);
      if (notice) next.set(selectedPath, notice);
      else next.delete(selectedPath);
      return next;
    });
  };
  const [savingFile, setSavingFile] = useState(false);
  const savingFileRef = useRef(false);
  const [acpTaskOpen, setAcpTaskOpen] = useState(
    () => focusState?.acpTaskOpen ?? false,
  );
  const [acpTaskDraft, setAcpTaskDraft] = useState(
    () => focusState?.acpTaskDraft ?? "",
  );
  const consumedNavigationIntents = useRef(new Set<string>());
  const hasWorkspace = Boolean(workspacePath.trim());
  const workspaceActive = active && hasWorkspace;
  const editorActive = workspaceActive && surface === "workspace";
  const focusWorkspaceControl = useCallback((selector: string) => {
    workspacePageRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, []);
  useLayoutEffect(() => {
    const grid = codeGridRef.current;
    if (!grid || !workspaceActive || surface !== "workspace") return;
    const measure = () => {
      const width = grid.clientWidth;
      if (!width) return;
      const fit = codeWorkspaceDockFit(width, layout.explorerVisible);
      const focusedPane =
        document.activeElement?.closest<HTMLElement>("[data-code-pane]");
      const pane = focusedPane?.dataset.codePane;
      if (
        (pane === "explorer" || pane === "utility") &&
        grid.contains(focusedPane ?? null) &&
        (focusedPane?.dataset.overlay === "true") !== !fit[pane]
      ) {
        focusWorkspaceControl(paneToggleSelector(pane));
      }
      setCodeGridWidth(width);
      setOverlayPane((pane) => (pane && !fit[pane] ? pane : null));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [focusWorkspaceControl, layout.explorerVisible, workspaceActive, surface]);
  useLayoutEffect(() => {
    if (surface !== "workspace" && overlayPane) setOverlayPane(null);
    const selector = pendingFocus.current;
    if (!selector) return;
    pendingFocus.current = null;
    focusWorkspaceControl(selector);
  });

  const dismissOverlay = useCallback((pane: SidePane) => {
    pendingFocus.current = paneToggleSelector(pane);
    setOverlayPane(null);
  }, []);

  const togglePane = useCallback(
    (pane: SidePane) => {
      if (surface !== "workspace" || zenMode) return;
      if (!(pane === "explorer" ? explorerFits : utilityFits)) {
        if (activeOverlay === pane) {
          dismissOverlay(pane);
        } else {
          pendingFocus.current = `[data-code-pane="${pane}"] [role="tab"][aria-selected="true"]`;
          setOverlayPane(pane);
        }
        return;
      }
      if (
        workspacePageRef.current
          ?.querySelector(`[data-code-pane="${pane}"]`)
          ?.contains(document.activeElement)
      ) {
        focusWorkspaceControl(paneToggleSelector(pane));
      }
      const key = pane === "explorer" ? "explorerVisible" : "utilityVisible";
      setLayout((current) => ({ ...current, [key]: !current[key] }));
    },
    [
      activeOverlay,
      explorerFits,
      dismissOverlay,
      focusWorkspaceControl,
      surface,
      utilityFits,
      zenMode,
    ],
  );
  const toggleZen = useCallback(() => {
    pendingFocus.current = zenMode
      ? "#code-surface-workspace-tab[aria-selected=true], #code-surface-preview-tab[aria-selected=true]"
      : "[data-code-focus-exit]";
    setOverlayPane(null);
    setLayout((current) => ({ ...current, zenMode: !current.zenMode }));
  }, [zenMode]);

  const widthPreferences = {
    ...layout,
    explorerVisible: explorerDocked,
    utilityVisible: utilityDocked,
  };
  const displayedWidths = codeWorkspaceWidthBudget(
    codeGridWidth,
    widthPreferences,
  );
  const resizeCodePane = (pane: SidePane, value: number) => {
    setLayout((current) => ({
      ...current,
      ...resizeCodeWorkspaceWidths(
        codeGridWidth,
        {
          ...current,
          explorerVisible: explorerDocked,
          utilityVisible: utilityDocked,
        },
        pane,
        value,
      ),
    }));
  };
  const acpEditor = useDesktopAcpEditorBridge({
    active: workspaceActive,
    workspacePath,
    botId,
    originConversationId,
  });
  const requestPolicy = codingWorkspaceRequests({
    // Keep the same scoped cache keys while the route is parked. `enabled`
    // pauses transport without replacing the visible document or tree owner.
    active: hasWorkspace,
    hasWorkspace,
    explorerVisible,
    utilityVisible,
    leftPane,
    editorPane,
    utilityPane,
    hasSelectedPath: Boolean(selectedPath),
    hasSearchQuery: Boolean(searchQuery),
  });

  useEffect(() => {
    onFocusStateChange?.({
      leftPane,
      editorPane,
      utilityPane,
      selectedPath,
      openDocumentPaths,
      searchDraft,
      searchQuery,
      acpTaskOpen,
      acpTaskDraft,
    });
  }, [
    acpTaskDraft,
    acpTaskOpen,
    editorPane,
    leftPane,
    onFocusStateChange,
    openDocumentPaths,
    searchDraft,
    searchQuery,
    selectedPath,
    utilityPane,
  ]);

  const {
    changes: changesResource,
    branches: branchesResource,
    conflicts: conflictsResource,
    remotes: remotesResource,
    stashes: stashesResource,
    worktrees: worktreeResource,
  } = useRepositoryResources({
    origin: resourceOrigin,
    changes: requestPolicy.changes,
    sourceControl: requestPolicy.sourceControl,
    worktrees: requestPolicy.worktrees,
    enabled: editorActive,
  });
  const summaryResource = useWorkspaceResource<RepositorySummaryResponse>(
    requestPolicy.summary ? "/repo/summary" : null,
    resourceOrigin,
    editorActive,
  );
  const treeResource = useWorkspaceResource<WorkspaceTreeResponse>(
    requestPolicy.tree ? "/workspace/tree?depth=12" : null,
    resourceOrigin,
    editorActive,
  );
  const logResource = useWorkspaceResource<RepositoryLogResponse>(
    requestPolicy.log ? "/repo/log" : null,
    resourceOrigin,
    editorActive,
  );
  const searchResource = useWorkspaceResource<WorkspaceSearchResponse>(
    requestPolicy.search
      ? `/workspace/search?query=${encodeURIComponent(searchQuery)}`
      : null,
    resourceOrigin,
    editorActive,
  );

  const changes = useMemo(
    () => toChanges(changesResource.data),
    [changesResource.data],
  );
  const treeEntries = useMemo(
    () =>
      asArray(treeResource.data?.entries)
        .map((entry) => {
          const record = asRecord(entry);
          const path = asString(record.path);
          const type = asString(record.type);
          if (!path || (type !== "file" && type !== "directory")) return null;
          return {
            path,
            type,
            depth: Math.max(0, Math.min(asNumber(record.depth), 12)),
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            path: string;
            type: "file" | "directory";
            depth: number;
          } => entry !== null,
        ),
    [treeResource.data],
  );
  const selectedChange = changes.find((change) => change.path === selectedPath);
  const selectedLanguage = useMemo(
    () => detectCodeLanguage(selectedPath),
    [selectedPath],
  );
  const fileResource = useWorkspaceResource<WorkspaceReadResponse>(
    requestPolicy.file
      ? `/workspace/read?path=${encodeURIComponent(selectedPath)}`
      : null,
    resourceOrigin,
    editorActive,
  );
  const patchResource = useRepositoryPatch(
    requestPolicy.patch && selectedChange ? selectedPath : undefined,
    stagedPatch,
    resourceOrigin,
    editorActive,
  );
  const summary = summaryResource.data?.summary ?? EMPTY_SUMMARY;
  const commits = commitRows(logResource.data?.log);
  const searchResults = asArray(searchResource.data?.results)
    .map(toSearchResult)
    .filter(
      (result): result is NonNullable<ReturnType<typeof toSearchResult>> =>
        result !== null,
    );

  useEffect(() => {
    if (initializedDocuments.current) return;
    const initial =
      changes[0]?.path ??
      treeEntries.find((entry) => entry.type === "file")?.path;
    if (initial) {
      initializedDocuments.current = true;
      setSelectedPath(initial);
      setOpenDocumentPaths([initial]);
    }
  }, [changes, treeEntries]);

  useEffect(() => {
    if (!selectedChange) return;
    setStagedPatch(selectedChange.staged && !selectedChange.unstaged);
  }, [selectedChange]);

  const loadedContent =
    fileResource.data?.path === selectedPath &&
    typeof fileResource.data.content === "string"
      ? fileResource.data.content
      : undefined;
  const currentEdit = fileEdits.get(selectedPath);
  const originalContent = currentEdit?.baseline ?? loadedContent ?? "";
  const draftContent = currentEdit?.content ?? originalContent;
  const fileDirty = draftContent !== originalContent;
  const workspaceDirty = [...fileEdits.values()].some(
    ({ baseline, content }) => baseline !== content,
  );
  const openDocuments = openDocumentPaths.map((path) => {
    const edit = fileEdits.get(path);
    return { path, dirty: Boolean(edit && edit.content !== edit.baseline) };
  });

  useLayoutEffect(() => {
    onDirtyChange?.(workspaceDirty);
  }, [workspaceDirty, onDirtyChange]);

  useLayoutEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const openPath = useCallback(
    (path: string, destination: EditorPane = "file") => {
      if (!active || editingLocked || !path) return false;
      initializedDocuments.current = true;
      setOpenDocumentPaths((paths) =>
        paths.includes(path) ? paths : [...paths, path],
      );
      setSelectedPath(path);
      setEditorPane(destination);
      return true;
    },
    [active, editingLocked],
  );

  const closeDocument = (path: string) => {
    if (!active || editingLocked || savingFileRef.current) return false;
    const index = openDocumentPaths.indexOf(path);
    if (index === -1) return false;
    const edit = fileEdits.get(path);
    if (
      edit &&
      edit.content !== edit.baseline &&
      !window.confirm(`Discard edits to ${path} and close its tab?`)
    )
      return false;
    setOpenDocumentPaths((paths) => paths.filter((entry) => entry !== path));
    setFileEdits((current) => {
      if (!current.has(path)) return current;
      const next = new Map(current);
      next.delete(path);
      return next;
    });
    setFileNotices((current) => {
      if (!current.has(path)) return current;
      const next = new Map(current);
      next.delete(path);
      return next;
    });
    if (path === selectedPath) {
      setSelectedPath(
        openDocumentPaths[index + 1] ?? openDocumentPaths[index - 1] ?? "",
      );
      setEditorPane("file");
    }
    return true;
  };

  useEffect(() => {
    if (navigationIntent?.kind !== "workspace-file" || !active) return;
    if (consumedNavigationIntents.current.has(navigationIntent.id)) {
      onAcknowledgeNavigationIntent(navigationIntent.id);
      return;
    }
    const path = navigationIntent.target.path.trim();
    if (path && openPath(path)) {
      consumedNavigationIntents.current.add(navigationIntent.id);
      onAcknowledgeNavigationIntent(navigationIntent.id);
    }
  }, [active, navigationIntent, onAcknowledgeNavigationIntent, openPath]);

  const openExplorerPath = (path: string, destination?: EditorPane) => {
    const opened = openPath(path, destination);
    if (activeOverlay === "explorer" && opened) {
      pendingFocus.current =
        '[data-code-editor] [role="tab"][aria-selected="true"]';
      setOverlayPane(null);
    }
    return opened;
  };

  useEffect(() => {
    try {
      saveCodeWorkspaceLayout(localStorage, workspacePath, layout);
    } catch {
      // The editor still works when the browser profile denies storage.
    }
  }, [layout, workspacePath]);

  useEffect(() => {
    if (!active) return;
    const handleWorkspaceShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (activeOverlay && event.key === "Escape") {
        event.preventDefault();
        dismissOverlay(activeOverlay);
        return;
      }
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (
        surface === "workspace" &&
        !zenMode &&
        key === "b" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        togglePane("explorer");
      } else if (
        surface === "workspace" &&
        !zenMode &&
        key === "j" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        togglePane("utility");
      } else if (key === "z" && event.shiftKey) {
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        event.preventDefault();
        toggleZen();
      }
    };
    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, [
    active,
    activeOverlay,
    dismissOverlay,
    surface,
    togglePane,
    toggleZen,
    zenMode,
  ]);

  const refreshAll = () => {
    if (active) void refreshWorkspaceResources(resourceOrigin);
  };
  const mutateRepository = (request: RepositoryMutationRequest) =>
    window.doolittle.mutateRepository(
      workspaceMutationRequest(request, resourceOrigin),
    );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active) return;
    const nextQuery = searchDraft.trim();
    if (!nextQuery) return;
    setSearchQuery(nextQuery);
    setLeftPane("search");
  };

  const discardFile = () => {
    if (editingLocked) return;
    setFileEdits((current) => {
      const next = new Map(current);
      next.delete(selectedPath);
      return next;
    });
    setFileNotice({
      tone: "neutral",
      message: "Local edits discarded. The workspace file was not changed.",
    });
  };

  const saveFile = async () => {
    if (
      !active ||
      editingLocked ||
      !selectedPath ||
      !fileDirty ||
      savingFileRef.current
    ) {
      return;
    }
    savingFileRef.current = true;
    setSavingFile(true);
    setFileNotice({
      tone: "neutral",
      message: "Review this save in the native confirmation dialog.",
    });
    try {
      const result = await window.doolittle.saveWorkspaceFile({
        botId,
        originConversationId,
        workspacePath,
        path: selectedPath,
        content: draftContent,
        expectedContent: originalContent,
      });
      if (result.status === "cancelled") {
        setFileNotice({
          tone: "neutral",
          message: "Save cancelled. Your edits remain only in this editor.",
        });
      } else if (result.status === "conflict") {
        setFileNotice({ tone: "bad", message: result.message });
      } else {
        await publishWorkspaceFileSave(
          resourceOrigin,
          selectedPath,
          draftContent,
        );
        setFileEdits((current) => {
          const latest = current.get(selectedPath);
          const next = new Map(current);
          if (latest && latest.content !== draftContent)
            next.set(selectedPath, {
              baseline: draftContent,
              content: latest.content,
            });
          else next.delete(selectedPath);
          return next;
        });
        setFileNotice({
          tone: "good",
          message: "Saved after native confirmation.",
        });
        refreshAll();
      }
    } catch (error) {
      setFileNotice({ tone: "bad", message: errorMessage(error) });
    } finally {
      savingFileRef.current = false;
      setSavingFile(false);
    }
  };

  const mutateVisiblePatch = async (
    type: Extract<
      RepositoryMutationRequest["type"],
      "stage-hunk" | "unstage-hunk" | "discard-hunk"
    >,
  ) => {
    if (!active || editingLocked) return;
    const patch = patchResource.data?.patch;
    if (!patch?.patch || patch.truncated) return;
    setFileNotice({
      tone: "neutral",
      message: "Review the selected patch operation in the native dialog.",
    });
    try {
      const result = await mutateRepository({ type, patch: patch.patch });
      if (result.status === "cancelled") {
        setFileNotice({ tone: "neutral", message: "Git operation cancelled." });
        return;
      }
      setFileNotice({
        tone: result.result.ok ? "good" : "bad",
        message:
          result.result.error || result.result.stderr || result.result.summary,
      });
      refreshAll();
    } catch (cause) {
      setFileNotice({ tone: "bad", message: errorMessage(cause) });
    }
  };

  const sendSelectedContext = () => {
    if (!active || editingLocked || !selectedPath) return;
    void acpEditor.flushEditorState();
    if (editorPane === "diff") {
      const patch = patchResource.data?.patch?.patch ?? "";
      void onSendToChat({
        text: [
          `Review and improve the change in ${selectedPath}.`,
          `<review_context path="${selectedPath}" source="${stagedPatch ? "staged" : "working-tree"}">`,
          boundedContext(patch || "No textual patch was available."),
          "</review_context>",
        ].join("\n"),
        workspacePath,
        projectScope,
        origin: resourceOrigin,
      });
      return;
    }
    void onSendToChat({
      text: [
        `Help me work on ${selectedPath}.`,
        `<file_context path="${selectedPath}">`,
        boundedContext(draftContent),
        "</file_context>",
      ].join("\n"),
      workspacePath,
      projectScope,
      origin: resourceOrigin,
    });
  };

  const submitAcpTask = async (event: FormEvent<HTMLFormElement>) => {
    if (!active || editingLocked) {
      event.preventDefault();
      return;
    }
    await submitAcpEditorTask(event, acpEditor.prompt, acpTaskDraft);
  };

  const handleUtilityPaneChange = (nextPane: UtilityPane) => {
    setUtilityPane(nextPane);
    if (nextPane === "terminal") onOpenChatTerminal();
  };

  if (!hasWorkspace) {
    return (
      <div
        className={`page ${CODING_WORKSPACE_PAGE_CLASS} overflow-y-auto px-3 py-2`}
      >
        <PageHeader
          description="Inspect files, changes, and workspace operations."
          eyebrow="Workspace"
          title="Code"
        />
        {active ? (
          <EmptyBlock
            actions={
              <button
                className="primary-button"
                onClick={() => void onChooseWorkspace()}
                type="button"
              >
                Choose a project folder
              </button>
            }
            density="compact"
            title="Start a project conversation"
          >
            Choose a folder and confirm access for this bot. Doolittle opens a
            conversation with that project’s files and tools.
          </EmptyBlock>
        ) : (
          <OfflineRouteState>
            Workspace files, repository state, and coding actions are
            unavailable until the local runtime is ready.
          </OfflineRouteState>
        )}
      </div>
    );
  }

  const overlayDismiss = activeOverlay ? (
    <button
      aria-label={
        activeOverlay === "explorer"
          ? "Close explorer"
          : "Close workspace tools"
      }
      className={CODING_PANE_DISMISS_CLASS}
      onClick={() => dismissOverlay(activeOverlay)}
      type="button"
    >
      <UiIcon icon={X} size="sm" />
    </button>
  ) : null;

  return (
    <div className={CODING_WORKSPACE_PAGE_CLASS} ref={workspacePageRef}>
      {visible && !active ? (
        <div className="ide-runtime-notice" role="status">
          Waiting for the local runtime. Open files and edits are kept.
        </div>
      ) : null}
      {zenMode ? (
        <div className="flex shrink-0 justify-end border-[var(--border)] border-b px-1">
          <button
            className={`${CODING_LAYOUT_BUTTON_CLASS} !h-8 !w-auto gap-1.5 px-2 [display:inline-flex] text-xs`}
            data-code-focus-exit
            onClick={toggleZen}
            type="button"
          >
            <UiIcon icon={Minimize2} size="xs" />
            Exit focus mode
          </button>
        </div>
      ) : (
        <CodingWorkspaceHeader
          active={active}
          onChangeRepository={() => void onChooseWorkspace(workspaceDirty)}
          explorerVisible={explorerVisible}
          surface={surface}
          onRefresh={refreshAll}
          onRetrySummary={summaryResource.reload}
          onSurfaceChange={(next) => {
            if (next === "preview") setOverlayPane(null);
            onSurfaceChange(next);
          }}
          onToggleExplorer={() => togglePane("explorer")}
          onToggleUtility={() => togglePane("utility")}
          onOpenTerminal={onOpenChatTerminal}
          terminalOpen={terminalOpen}
          onToggleZen={toggleZen}
          hasSummary={Boolean(summaryResource.data?.summary)}
          summary={summary}
          summaryError={summaryResource.error}
          summaryLoading={summaryResource.loading}
          utilityVisible={utilityVisible}
          workspacePath={workspacePath}
          zenMode={zenMode}
        />
      )}
      <div
        aria-label={zenMode ? "Code workspace" : undefined}
        aria-labelledby={zenMode ? undefined : "code-surface-workspace-tab"}
        aria-hidden={surface !== "workspace"}
        hidden={surface !== "workspace"}
        id="coding-workspace-surface"
        ref={codeGridRef}
        inert={surface !== "workspace"}
        role="tabpanel"
        className={codingGridClass(explorerDocked, utilityDocked)}
        style={
          {
            "--coding-explorer-width": `${displayedWidths.explorerWidth}px`,
            "--coding-utility-width": `${displayedWidths.utilityWidth}px`,
          } as CSSProperties
        }
      >
        {explorerVisible ? (
          <CodingWorkspaceExplorer
            contextScope={JSON.stringify([
              botId,
              originConversationId,
              workspacePath,
            ])}
            changes={changes}
            changesResource={changesResource}
            dismissControl={
              activeOverlay === "explorer" ? overlayDismiss : null
            }
            inert={activeOverlay === "utility"}
            leftPane={leftPane}
            onLeftPaneChange={setLeftPane}
            onOpenPath={openExplorerPath}
            onResize={(value) => resizeCodePane("explorer", value)}
            resizeBounds={displayedWidths.explorerBounds}
            onSearchDraftChange={setSearchDraft}
            onSubmitSearch={submitSearch}
            searchDraft={searchDraft}
            searchQuery={searchQuery}
            searchResource={searchResource}
            searchResults={searchResults}
            selectedPath={selectedPath}
            treeEntries={treeEntries}
            treeResource={treeResource}
            width={displayedWidths.explorerWidth}
          />
        ) : null}

        <div
          className="isolate flex min-h-0 min-w-0 flex-col"
          data-code-editor
          inert={Boolean(activeOverlay)}
        >
          <CodingWorkspaceEditor
            active={editorActive}
            botId={botId}
            originConversationId={originConversationId}
            acpEditor={acpEditor}
            acpTaskDraft={acpTaskDraft}
            acpTaskOpen={acpTaskOpen}
            draftContent={draftContent}
            editingLocked={editingLocked || !active}
            editorPane={editorPane}
            fileDirty={fileDirty}
            fileNotice={fileNotice}
            fileResource={fileResource}
            openDocuments={openDocuments}
            onOpenDocument={openPath}
            onCloseDocument={closeDocument}
            onAcpTaskDraftChange={(value) => {
              if (!editingLocked) setAcpTaskDraft(value);
            }}
            onAcpTaskOpenChange={(open) => {
              if (!editingLocked) setAcpTaskOpen(open);
            }}
            onDiscard={discardFile}
            onDraftChange={(value) => {
              if (!editorActive || editingLocked) return;
              setFileEdits((current) => {
                const next = new Map(current);
                if (value === originalContent) next.delete(selectedPath);
                else
                  next.set(selectedPath, {
                    baseline: originalContent,
                    content: value,
                  });
                return next;
              });
              if (fileNotice?.tone !== "bad") setFileNotice(null);
            }}
            onEditorPaneChange={setEditorPane}
            onEditorStateChange={(snapshot: CodeEditorStateSnapshot) =>
              acpEditor.publishEditorState(snapshot, fileDirty)
            }
            onMutateVisiblePatch={mutateVisiblePatch}
            onSave={() => void saveFile()}
            onSendSelectedContext={sendSelectedContext}
            onSetStagedPatch={setStagedPatch}
            onSubmitAcpTask={submitAcpTask}
            patchResource={patchResource}
            savingFile={savingFile}
            selectedChange={selectedChange}
            selectedLanguage={selectedLanguage}
            selectedPath={selectedPath}
            stagedPatch={stagedPatch}
            workspacePath={workspacePath}
          />
        </div>

        {utilityVisible ? (
          <CodingWorkspaceUtility
            active={active && !editingLocked}
            canCreateWorktree={canCreateWorktree}
            branchesResource={branchesResource}
            changes={changes}
            conflictsResource={conflictsResource}
            commits={commits}
            dismissControl={activeOverlay === "utility" ? overlayDismiss : null}
            logResource={logResource}
            mutateRepository={mutateRepository}
            origin={resourceOrigin}
            onChooseWorkspace={() => onChooseWorkspace(workspaceDirty)}
            onOpenWorkspacePath={(path) =>
              onOpenWorkspacePath(path, workspaceDirty)
            }
            onOpenDiff={(path) => {
              const opened = openPath(path, "diff");
              if (activeOverlay === "utility" && opened) {
                pendingFocus.current =
                  '[data-code-editor] [role="tab"][aria-selected="true"]';
                setOverlayPane(null);
              }
              return opened;
            }}
            selectedPath={selectedPath}
            onOpenTerminal={onOpenChatTerminal}
            onRefresh={refreshAll}
            onResize={(value) => resizeCodePane("utility", value)}
            resizeBounds={displayedWidths.utilityBounds}
            remotesResource={remotesResource}
            stashesResource={stashesResource}
            summary={summary}
            utilityPane={utilityPane}
            onUtilityPaneChange={handleUtilityPaneChange}
            width={displayedWidths.utilityWidth}
            worktreeResource={worktreeResource}
          />
        ) : null}
        {activeOverlay ? (
          <button
            aria-label="Dismiss workspace pane"
            className="absolute inset-0 z-45 bg-[color-mix(in_srgb,var(--bg)_65%,transparent)]"
            onClick={() => dismissOverlay(activeOverlay)}
            tabIndex={-1}
            type="button"
          />
        ) : null}
      </div>
      <div
        aria-label={zenMode ? "Local preview" : undefined}
        aria-labelledby={zenMode ? undefined : "code-surface-preview-tab"}
        id="coding-preview-surface"
        aria-hidden={surface !== "preview"}
        className="flex min-h-0 min-w-0 flex-1"
        hidden={surface !== "preview"}
        inert={surface !== "preview"}
        role="tabpanel"
      >
        <BrowserPage
          botId={botId}
          active={active && surface === "preview"}
          evidenceAvailable={previewEvidenceAvailable}
          origin={resourceOrigin}
          onSendToChat={(text) =>
            onSendToChat({
              text,
              workspacePath,
              projectScope,
              origin: resourceOrigin,
            })
          }
        />
      </div>
    </div>
  );
}
