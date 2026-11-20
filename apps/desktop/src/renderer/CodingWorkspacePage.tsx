import type { RepositoryMutationRequest } from "@doolittle/contracts/repository";
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
  CODING_WORKSPACE_PAGE_CLASS,
  CODING_WORKSPACE_ZEN_CLASS,
  codingGridClass,
} from "./coding-workspace/layout";
import {
  type ActionNotice,
  boundedContext,
  commitRows,
  type EditorPane,
  EMPTY_SUMMARY,
  type LeftPane,
  type RepositoryBranchesResponse,
  type RepositoryChangesResponse,
  type RepositoryConflictsResponse,
  type RepositoryLogResponse,
  type RepositoryPatchResponse,
  type RepositoryRemotesResponse,
  type RepositoryStashesResponse,
  type RepositorySummaryResponse,
  type RepositoryWorktreesResponse,
  toChanges,
  toSearchResult,
  type UtilityPane,
  type WorkspaceReadResponse,
  type WorkspaceSearchResponse,
  type WorkspaceTreeResponse,
} from "./coding-workspace/models";
import type { CodeEditorStateSnapshot } from "./components/CodeEditor";
import { OfflineRouteState } from "./components/OfflineRouteState";
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
  useApiResource as useApplicationResource,
} from "./lib";
import type { ProjectScope } from "./project-manager/models";
import { codingWorkspaceRequests } from "./resource-request-policy";
import {
  codeWorkspaceWidthBudget,
  loadCodeWorkspaceLayout,
  resizeCodeWorkspaceWidths,
  saveCodeWorkspaceLayout,
} from "./workspace-layout-state";

/** Keep cached coding resources isolated when the runtime workspace changes. */
export function codingWorkspaceResourceDependencies(
  enabled: boolean,
  workspacePath: string,
  ...dependencies: readonly unknown[]
): readonly unknown[] {
  return [enabled, workspacePath, ...dependencies];
}

export function CodingWorkspacePage({
  active,
  editingLocked,
  navigationIntent,
  onAcknowledgeNavigationIntent,
  onChooseWorkspace,
  onOpenWorkspacePath,
  onOpenChatTerminal,
  onSendToChat,
  onDirtyChange,
  focusState,
  onFocusStateChange,
  projectScope,
  surface,
  onSurfaceChange,
  workspacePath,
  botId,
  originConversationId,
}: {
  active: boolean;
  editingLocked: boolean;
  navigationIntent: DesktopNavigationIntent | null;
  onAcknowledgeNavigationIntent: (id: string) => void;
  onChooseWorkspace: () => Promise<WorkspacePickResult>;
  onOpenWorkspacePath: (path: string) => Promise<WorkspacePickResult>;
  onOpenChatTerminal: () => void;
  onSendToChat: (request: ChatContextRequest) => void;
  onDirtyChange?: (dirty: boolean) => void;
  focusState?: CodingWorkspaceFocusState;
  onFocusStateChange?: (state: CodingWorkspaceFocusState) => void;
  projectScope: ProjectScope;
  surface: CodeSurface;
  onSurfaceChange: (surface: CodeSurface) => void;
  workspacePath: string;
  botId?: string;
  originConversationId?: string;
}) {
  const resourceOrigin =
    botId && originConversationId
      ? { botId, originConversationId, workspacePath }
      : undefined;
  // DesktopRouteContent keys this editor by its workspace and conversation owner.
  const [layout, setLayout] = useState(() =>
    loadCodeWorkspaceLayout(localStorage, workspacePath),
  );
  const { explorerVisible, utilityVisible, zenMode } = layout;
  const toggleLayout = useCallback(
    (control: "explorerVisible" | "utilityVisible" | "zenMode") =>
      setLayout((current) => ({ ...current, [control]: !current[control] })),
    [],
  );
  const codeGridRef = useRef<HTMLDivElement>(null);
  const [codeGridWidth, setCodeGridWidth] = useState(0);
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
  const [stagedPatch, setStagedPatch] = useState(false);
  const [searchDraft, setSearchDraft] = useState(
    () => focusState?.searchDraft ?? "",
  );
  const [searchQuery, setSearchQuery] = useState(
    () => focusState?.searchQuery ?? "",
  );
  const [fileEdit, setFileEdit] = useState<{
    path: string;
    baseline: string;
    content: string;
  } | null>(null);
  const [fileNotice, setFileNotice] = useState<ActionNotice | null>(null);
  const [savingFile, setSavingFile] = useState(false);
  const [acpTaskOpen, setAcpTaskOpen] = useState(
    () => focusState?.acpTaskOpen ?? false,
  );
  const [acpTaskDraft, setAcpTaskDraft] = useState(
    () => focusState?.acpTaskDraft ?? "",
  );
  const consumedNavigationIntents = useRef(new Set<string>());
  const hasWorkspace = Boolean(workspacePath.trim());
  const workspaceActive = active && hasWorkspace;
  useLayoutEffect(() => {
    const grid = codeGridRef.current;
    if (!grid || !active || !hasWorkspace || surface !== "workspace") return;
    const measure = () => {
      if (grid.clientWidth > 0) setCodeGridWidth(grid.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [active, hasWorkspace, surface]);
  const displayedWidths = codeWorkspaceWidthBudget(codeGridWidth, layout);
  const resizeCodePane = (pane: "explorer" | "utility", value: number) => {
    setLayout((current) => ({
      ...current,
      ...resizeCodeWorkspaceWidths(codeGridWidth, current, pane, value),
    }));
  };
  const acpEditor = useDesktopAcpEditorBridge({
    active: workspaceActive,
    workspacePath,
    botId,
    originConversationId,
  });
  const requestPolicy = codingWorkspaceRequests({
    active,
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
    searchDraft,
    searchQuery,
    selectedPath,
    utilityPane,
  ]);

  const summaryResource = useApplicationResource<RepositorySummaryResponse>(
    requestPolicy.summary ? "/repo/summary" : null,
    codingWorkspaceResourceDependencies(requestPolicy.summary, workspacePath),
    botId,
    resourceOrigin,
  );
  const treeResource = useApplicationResource<WorkspaceTreeResponse>(
    requestPolicy.tree ? "/workspace/tree?depth=12" : null,
    codingWorkspaceResourceDependencies(requestPolicy.tree, workspacePath),
    botId,
    resourceOrigin,
  );
  const changesResource = useApplicationResource<RepositoryChangesResponse>(
    requestPolicy.changes ? "/repo/changes" : null,
    codingWorkspaceResourceDependencies(requestPolicy.changes, workspacePath),
    botId,
    resourceOrigin,
  );
  const logResource = useApplicationResource<RepositoryLogResponse>(
    requestPolicy.log ? "/repo/log" : null,
    codingWorkspaceResourceDependencies(requestPolicy.log, workspacePath),
    botId,
    resourceOrigin,
  );
  const worktreeResource = useApplicationResource<RepositoryWorktreesResponse>(
    requestPolicy.worktrees ? "/repo/worktrees" : null,
    codingWorkspaceResourceDependencies(requestPolicy.worktrees, workspacePath),
    botId,
    resourceOrigin,
  );
  const branchesResource = useApplicationResource<RepositoryBranchesResponse>(
    requestPolicy.sourceControl ? "/repo/branches" : null,
    codingWorkspaceResourceDependencies(
      requestPolicy.sourceControl,
      workspacePath,
    ),
    botId,
    resourceOrigin,
  );
  const remotesResource = useApplicationResource<RepositoryRemotesResponse>(
    requestPolicy.sourceControl ? "/repo/remotes" : null,
    codingWorkspaceResourceDependencies(
      requestPolicy.sourceControl,
      workspacePath,
    ),
    botId,
    resourceOrigin,
  );
  const stashesResource = useApplicationResource<RepositoryStashesResponse>(
    requestPolicy.sourceControl ? "/repo/stashes" : null,
    codingWorkspaceResourceDependencies(
      requestPolicy.sourceControl,
      workspacePath,
    ),
    botId,
    resourceOrigin,
  );
  const conflictsResource = useApplicationResource<RepositoryConflictsResponse>(
    requestPolicy.sourceControl ? "/repo/conflicts" : null,
    codingWorkspaceResourceDependencies(
      requestPolicy.sourceControl,
      workspacePath,
    ),
    botId,
    resourceOrigin,
  );
  const searchResource = useApplicationResource<WorkspaceSearchResponse>(
    requestPolicy.search
      ? `/workspace/search?query=${encodeURIComponent(searchQuery)}`
      : null,
    codingWorkspaceResourceDependencies(
      requestPolicy.search,
      workspacePath,
      searchQuery,
    ),
    botId,
    resourceOrigin,
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
  const fileResource = useApplicationResource<WorkspaceReadResponse>(
    requestPolicy.file
      ? `/workspace/read?path=${encodeURIComponent(selectedPath)}`
      : null,
    codingWorkspaceResourceDependencies(
      requestPolicy.file,
      workspacePath,
      selectedPath,
    ),
    botId,
    resourceOrigin,
  );
  const patchResource = useApplicationResource<RepositoryPatchResponse>(
    requestPolicy.patch && selectedChange
      ? `/repo/patch?path=${encodeURIComponent(selectedPath)}&staged=${stagedPatch}`
      : null,
    codingWorkspaceResourceDependencies(
      requestPolicy.patch,
      workspacePath,
      selectedPath,
      stagedPatch,
      selectedChange?.path,
    ),
    botId,
    resourceOrigin,
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
    if (selectedPath) return;
    const initial =
      changes[0]?.path ??
      treeEntries.find((entry) => entry.type === "file")?.path;
    if (initial) setSelectedPath(initial);
  }, [changes, selectedPath, treeEntries]);

  useEffect(() => {
    if (!selectedChange) return;
    setStagedPatch(selectedChange.staged && !selectedChange.unstaged);
  }, [selectedChange]);

  const loadedContent =
    fileResource.data?.path === selectedPath &&
    typeof fileResource.data.content === "string"
      ? fileResource.data.content
      : undefined;
  const currentEdit = fileEdit?.path === selectedPath ? fileEdit : null;
  const originalContent = currentEdit?.baseline ?? loadedContent ?? "";
  const draftContent = currentEdit?.content ?? originalContent;
  const fileDirty = draftContent !== originalContent;

  useEffect(() => {
    if (loadedContent === undefined) return;
    // After saving, use the authoritative read again when its cache refreshes.
    setFileEdit((current) =>
      current?.path === selectedPath && current.content === current.baseline
        ? null
        : current,
    );
  }, [loadedContent, selectedPath]);

  useEffect(() => {
    onDirtyChange?.(fileDirty);
  }, [fileDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const openPath = useCallback(
    (path: string, destination: EditorPane = "file") => {
      if (editingLocked) return false;
      if (path !== selectedPath && fileDirty) {
        setFileNotice({
          tone: "warn",
          message: "Save or discard this file before opening another one.",
        });
        return false;
      }
      if (path !== selectedPath) {
        setFileEdit(null);
        setFileNotice(null);
      }
      setSelectedPath(path);
      setEditorPane(destination);
      return true;
    },
    [editingLocked, fileDirty, selectedPath],
  );

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
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "b" && !event.shiftKey) {
        event.preventDefault();
        toggleLayout("explorerVisible");
      } else if (key === "j" && !event.shiftKey) {
        event.preventDefault();
        toggleLayout("utilityVisible");
      } else if (key === "z" && event.shiftKey) {
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        event.preventDefault();
        toggleLayout("zenMode");
      }
    };
    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, [active, toggleLayout]);

  const refreshAll = () => {
    if (!active) return;
    summaryResource.reload();
    treeResource.reload();
    changesResource.reload();
    logResource.reload();
    worktreeResource.reload();
    branchesResource.reload();
    remotesResource.reload();
    stashesResource.reload();
    conflictsResource.reload();
    if (searchQuery) searchResource.reload();
    if (selectedPath) fileResource.reload();
    if (selectedChange) patchResource.reload();
  };

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
    setFileEdit(null);
    setFileNotice({
      tone: "neutral",
      message: "Local edits discarded. The workspace file was not changed.",
    });
  };

  const saveFile = async () => {
    if (!active || editingLocked || !selectedPath || !fileDirty || savingFile) {
      return;
    }
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
        setFileEdit({
          path: selectedPath,
          baseline: draftContent,
          content: draftContent,
        });
        fileResource.reload();
        setFileNotice({
          tone: "good",
          message: "Saved after native confirmation.",
        });
        summaryResource.reload();
        changesResource.reload();
        patchResource.reload();
      }
    } catch (error) {
      setFileNotice({ tone: "bad", message: errorMessage(error) });
    } finally {
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
      const result = await window.doolittle.mutateRepository({
        botId,
        originConversationId,
        workspacePath,
        type,
        patch: patch.patch,
      });
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
      onSendToChat({
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
    onSendToChat({
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

  if (!workspaceActive) {
    return (
      <div className={CODING_WORKSPACE_PAGE_CLASS}>
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

  return (
    <div
      className={`${CODING_WORKSPACE_PAGE_CLASS} ${zenMode ? CODING_WORKSPACE_ZEN_CLASS : ""}`}
    >
      {!zenMode ? (
        <CodingWorkspaceHeader
          active={active}
          explorerVisible={explorerVisible}
          surface={surface}
          onRefresh={refreshAll}
          onRetrySummary={summaryResource.reload}
          onSurfaceChange={onSurfaceChange}
          onToggleExplorer={() => toggleLayout("explorerVisible")}
          onToggleUtility={() => toggleLayout("utilityVisible")}
          onToggleZen={() => toggleLayout("zenMode")}
          hasSummary={Boolean(summaryResource.data?.summary)}
          summary={summary}
          summaryError={summaryResource.error}
          summaryLoading={summaryResource.loading}
          utilityVisible={utilityVisible}
          zenMode={zenMode}
        />
      ) : null}
      <div
        aria-label={zenMode ? "Code workspace" : undefined}
        aria-labelledby={zenMode ? undefined : "code-surface-workspace-tab"}
        aria-hidden={surface !== "workspace"}
        hidden={surface !== "workspace"}
        id="coding-workspace-surface"
        ref={codeGridRef}
        inert={surface !== "workspace"}
        role="tabpanel"
        className={codingGridClass(explorerVisible, utilityVisible, zenMode)}
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
            leftPane={leftPane}
            onLeftPaneChange={setLeftPane}
            onOpenPath={openPath}
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

        <CodingWorkspaceEditor
          botId={botId}
          originConversationId={originConversationId}
          acpEditor={acpEditor}
          acpTaskDraft={acpTaskDraft}
          acpTaskOpen={acpTaskOpen}
          draftContent={draftContent}
          editingLocked={editingLocked}
          editorPane={editorPane}
          fileDirty={fileDirty}
          fileNotice={fileNotice}
          fileResource={fileResource}
          onAcpTaskDraftChange={(value) => {
            if (!editingLocked) setAcpTaskDraft(value);
          }}
          onAcpTaskOpenChange={(open) => {
            if (!editingLocked) setAcpTaskOpen(open);
          }}
          onDiscard={discardFile}
          onDraftChange={(value) => {
            if (editingLocked) return;
            setFileEdit(
              value === originalContent
                ? null
                : {
                    path: selectedPath,
                    baseline: originalContent,
                    content: value,
                  },
            );
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

        {utilityVisible ? (
          <CodingWorkspaceUtility
            active={active && !editingLocked}
            branchesResource={branchesResource}
            changes={changes}
            conflictsResource={conflictsResource}
            commits={commits}
            logResource={logResource}
            onChooseWorkspace={onChooseWorkspace}
            onOpenWorkspacePath={onOpenWorkspacePath}
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
          contextual
          onSendToChat={(text) => {
            onSendToChat({
              text,
              workspacePath,
              projectScope,
              origin:
                botId && originConversationId
                  ? { botId, originConversationId, workspacePath }
                  : undefined,
            });
            return true;
          }}
        />
      </div>
    </div>
  );
}
