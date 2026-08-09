import type { RepositoryMutationRequest } from "@doolittle/contracts/repository";
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WorkspacePickResult } from "../shared/contracts";
import type { ChatContextRequest } from "./chat-context-handoff";
import { detectCodeLanguage } from "./code-language";
import { CodingWorkspaceEditor } from "./coding-workspace/CodingWorkspaceEditor";
import { CodingWorkspaceExplorer } from "./coding-workspace/CodingWorkspaceExplorer";
import { CodingWorkspaceHeader } from "./coding-workspace/CodingWorkspaceHeader";
import { CodingWorkspaceUtility } from "./coding-workspace/CodingWorkspaceUtility";
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
import { useDesktopAcpEditorBridge } from "./desktop-acp-client";
import type { DesktopNavigationIntent } from "./desktop-navigation-intent";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  errorMessage,
  useApiResource,
} from "./lib";
import {
  CODE_EXPLORER_WIDTH,
  CODE_EXPLORER_WIDTH_KEY,
  CODE_UTILITY_WIDTH,
  CODE_UTILITY_WIDTH_KEY,
  loadPanelWidth,
  savePanelWidth,
} from "./panel-layout";
import type { ProjectScope } from "./project-manager/models";
import { codingWorkspaceRequests } from "./resource-request-policy";
import "./coding-workspace.css";

const EXPLORER_VISIBLE_KEY = "doolittle.desktop.code.explorer-visible.v1";
const UTILITY_VISIBLE_KEY = "doolittle.desktop.code.utility-visible.v1";
const ZEN_MODE_KEY = "doolittle.desktop.code.zen-mode.v1";

function loadBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

export function CodingWorkspacePage({
  active,
  navigationIntent,
  onAcknowledgeNavigationIntent,
  onChooseWorkspace,
  onOpenWorkspacePath,
  onSendToChat,
  projectScope,
  workspacePath,
}: {
  active: boolean;
  navigationIntent: DesktopNavigationIntent | null;
  onAcknowledgeNavigationIntent: (id: string) => void;
  onChooseWorkspace: () => Promise<WorkspacePickResult>;
  onOpenWorkspacePath: (path: string) => Promise<WorkspacePickResult>;
  onSendToChat: (request: ChatContextRequest) => void;
  projectScope: ProjectScope;
  workspacePath: string;
}) {
  const [explorerVisible, setExplorerVisible] = useState(() =>
    loadBooleanPreference(EXPLORER_VISIBLE_KEY, true),
  );
  const [utilityVisible, setUtilityVisible] = useState(() =>
    loadBooleanPreference(UTILITY_VISIBLE_KEY, true),
  );
  const [zenMode, setZenMode] = useState(() =>
    loadBooleanPreference(ZEN_MODE_KEY, false),
  );
  const [explorerWidth, setExplorerWidth] = useState(() =>
    loadPanelWidth(localStorage, CODE_EXPLORER_WIDTH_KEY, CODE_EXPLORER_WIDTH),
  );
  const [utilityWidth, setUtilityWidth] = useState(() =>
    loadPanelWidth(localStorage, CODE_UTILITY_WIDTH_KEY, CODE_UTILITY_WIDTH),
  );
  const [leftPane, setLeftPane] = useState<LeftPane>("files");
  const [editorPane, setEditorPane] = useState<EditorPane>("file");
  const [utilityPane, setUtilityPane] = useState<UtilityPane>("terminal");
  const [selectedPath, setSelectedPath] = useState("");
  const [stagedPatch, setStagedPatch] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [fileNotice, setFileNotice] = useState<ActionNotice | null>(null);
  const [savingFile, setSavingFile] = useState(false);
  const [acpTaskOpen, setAcpTaskOpen] = useState(false);
  const [acpTaskDraft, setAcpTaskDraft] = useState("");
  const fileDirtyRef = useRef(false);
  const consumedNavigationIntents = useRef(new Set<string>());
  const acpEditor = useDesktopAcpEditorBridge({ active, workspacePath });
  const requestPolicy = codingWorkspaceRequests({
    active,
    explorerVisible,
    utilityVisible,
    leftPane,
    editorPane,
    utilityPane,
    hasSelectedPath: Boolean(selectedPath),
    hasSearchQuery: Boolean(searchQuery),
  });

  const summaryResource = useApiResource<RepositorySummaryResponse>(
    requestPolicy.summary ? "/repo/summary" : null,
    [requestPolicy.summary],
  );
  const treeResource = useApiResource<WorkspaceTreeResponse>(
    requestPolicy.tree ? "/workspace/tree?depth=12" : null,
    [requestPolicy.tree],
  );
  const changesResource = useApiResource<RepositoryChangesResponse>(
    requestPolicy.changes ? "/repo/changes" : null,
    [requestPolicy.changes],
  );
  const logResource = useApiResource<RepositoryLogResponse>(
    requestPolicy.log ? "/repo/log" : null,
    [requestPolicy.log],
  );
  const worktreeResource = useApiResource<RepositoryWorktreesResponse>(
    requestPolicy.worktrees ? "/repo/worktrees" : null,
    [requestPolicy.worktrees],
  );
  const branchesResource = useApiResource<RepositoryBranchesResponse>(
    requestPolicy.sourceControl ? "/repo/branches" : null,
    [requestPolicy.sourceControl],
  );
  const remotesResource = useApiResource<RepositoryRemotesResponse>(
    requestPolicy.sourceControl ? "/repo/remotes" : null,
    [requestPolicy.sourceControl],
  );
  const stashesResource = useApiResource<RepositoryStashesResponse>(
    requestPolicy.sourceControl ? "/repo/stashes" : null,
    [requestPolicy.sourceControl],
  );
  const conflictsResource = useApiResource<RepositoryConflictsResponse>(
    requestPolicy.sourceControl ? "/repo/conflicts" : null,
    [requestPolicy.sourceControl],
  );
  const searchResource = useApiResource<WorkspaceSearchResponse>(
    requestPolicy.search
      ? `/workspace/search?query=${encodeURIComponent(searchQuery)}`
      : null,
    [requestPolicy.search, searchQuery],
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
  const fileResource = useApiResource<WorkspaceReadResponse>(
    requestPolicy.file
      ? `/workspace/read?path=${encodeURIComponent(selectedPath)}`
      : null,
    [requestPolicy.file, selectedPath],
  );
  const patchResource = useApiResource<RepositoryPatchResponse>(
    requestPolicy.patch && selectedChange
      ? `/repo/patch?path=${encodeURIComponent(selectedPath)}&staged=${stagedPatch}`
      : null,
    [requestPolicy.patch, selectedPath, stagedPatch, selectedChange?.path],
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

  useEffect(() => {
    if (
      fileResource.loading ||
      fileResource.data?.path !== selectedPath ||
      typeof fileResource.data.content !== "string" ||
      fileDirtyRef.current
    ) {
      return;
    }
    setOriginalContent(fileResource.data.content);
    setDraftContent(fileResource.data.content);
    setFileNotice(null);
  }, [
    fileResource.data?.content,
    fileResource.data?.path,
    fileResource.loading,
    selectedPath,
  ]);

  const fileDirty = draftContent !== originalContent;
  fileDirtyRef.current = fileDirty;

  const openPath = useCallback(
    (path: string, destination: EditorPane = "file") => {
      if (path !== selectedPath && fileDirty) {
        setFileNotice({
          tone: "warn",
          message: "Save or discard this file before opening another one.",
        });
        return false;
      }
      setSelectedPath(path);
      setEditorPane(destination);
      return true;
    },
    [fileDirty, selectedPath],
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
    localStorage.setItem(EXPLORER_VISIBLE_KEY, String(explorerVisible));
    localStorage.setItem(UTILITY_VISIBLE_KEY, String(utilityVisible));
    localStorage.setItem(ZEN_MODE_KEY, String(zenMode));
  }, [explorerVisible, utilityVisible, zenMode]);

  useEffect(() => {
    savePanelWidth(
      localStorage,
      CODE_EXPLORER_WIDTH_KEY,
      explorerWidth,
      CODE_EXPLORER_WIDTH,
    );
  }, [explorerWidth]);

  useEffect(() => {
    savePanelWidth(
      localStorage,
      CODE_UTILITY_WIDTH_KEY,
      utilityWidth,
      CODE_UTILITY_WIDTH,
    );
  }, [utilityWidth]);

  useEffect(() => {
    if (!active) return;
    const handleWorkspaceShortcut = (event: globalThis.KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "b" && !event.shiftKey) {
        event.preventDefault();
        setExplorerVisible((current) => !current);
      } else if (key === "j" && !event.shiftKey) {
        event.preventDefault();
        setUtilityVisible((current) => !current);
      } else if (key === "z" && event.shiftKey) {
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        event.preventDefault();
        setZenMode((current) => !current);
      }
    };
    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, [active]);

  const refreshAll = () => {
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
    const nextQuery = searchDraft.trim();
    if (!nextQuery) return;
    setSearchQuery(nextQuery);
    setLeftPane("search");
  };

  const discardFile = () => {
    setDraftContent(originalContent);
    setFileNotice({
      tone: "neutral",
      message: "Local edits discarded. The workspace file was not changed.",
    });
  };

  const saveFile = async () => {
    if (!selectedPath || !fileDirty || savingFile) return;
    setSavingFile(true);
    setFileNotice({
      tone: "neutral",
      message: "Review this save in the native confirmation dialog.",
    });
    try {
      const result = await window.doolittle.saveWorkspaceFile({
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
        setOriginalContent(draftContent);
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
    const patch = patchResource.data?.patch;
    if (!patch?.patch || patch.truncated) return;
    setFileNotice({
      tone: "neutral",
      message: "Review the selected patch operation in the native dialog.",
    });
    try {
      const result = await window.doolittle.mutateRepository({
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
    if (!selectedPath) return;
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
      });
      return;
    }
    onSendToChat({
      text: [
        `Help me work on ${selectedPath}.`,
        `<file_context path="${selectedPath}">`,
        boundedContext(draftContent || originalContent),
        "</file_context>",
      ].join("\n"),
      workspacePath,
      projectScope,
    });
  };

  const submitAcpTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await acpEditor.prompt(acpTaskDraft);
  };

  return (
    <div className={`page coding-workspace-page ${zenMode ? "zen" : ""}`}>
      <CodingWorkspaceHeader
        active={active}
        explorerVisible={explorerVisible}
        onRefresh={refreshAll}
        onRetrySummary={summaryResource.reload}
        onToggleExplorer={() => setExplorerVisible((current) => !current)}
        onToggleUtility={() => setUtilityVisible((current) => !current)}
        onToggleZen={() => setZenMode((current) => !current)}
        hasSummary={Boolean(summaryResource.data)}
        summary={summary}
        summaryError={summaryResource.error}
        summaryLoading={summaryResource.loading}
        utilityVisible={utilityVisible}
        zenMode={zenMode}
      />
      <div
        className={`coding-grid ${explorerVisible ? "" : "explorer-hidden"} ${utilityVisible ? "" : "utility-hidden"}`.trim()}
        style={
          {
            "--coding-explorer-width": `${explorerWidth}px`,
            "--coding-utility-width": `${utilityWidth}px`,
          } as CSSProperties
        }
      >
        {explorerVisible ? (
          <CodingWorkspaceExplorer
            changes={changes}
            changesResource={changesResource}
            leftPane={leftPane}
            onLeftPaneChange={setLeftPane}
            onOpenPath={openPath}
            onResize={setExplorerWidth}
            onSearchDraftChange={setSearchDraft}
            onSubmitSearch={submitSearch}
            searchDraft={searchDraft}
            searchQuery={searchQuery}
            searchResource={searchResource}
            searchResults={searchResults}
            selectedPath={selectedPath}
            treeEntries={treeEntries}
            treeResource={treeResource}
            width={explorerWidth}
          />
        ) : null}

        <CodingWorkspaceEditor
          acpEditor={acpEditor}
          acpTaskDraft={acpTaskDraft}
          acpTaskOpen={acpTaskOpen}
          draftContent={draftContent}
          editorPane={editorPane}
          fileDirty={fileDirty}
          fileNotice={fileNotice}
          fileResource={fileResource}
          onAcpTaskDraftChange={setAcpTaskDraft}
          onAcpTaskOpenChange={setAcpTaskOpen}
          onDiscard={discardFile}
          onDraftChange={(value) => {
            setDraftContent(value);
            if (fileNotice?.tone !== "bad") setFileNotice(null);
          }}
          onEditorPaneChange={setEditorPane}
          onEditorStateChange={(snapshot: CodeEditorStateSnapshot) =>
            acpEditor.publishEditorState(snapshot, fileDirtyRef.current)
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
            active={active}
            branchesResource={branchesResource}
            changes={changes}
            conflictsResource={conflictsResource}
            commits={commits}
            logResource={logResource}
            onChooseWorkspace={onChooseWorkspace}
            onOpenWorkspacePath={onOpenWorkspacePath}
            onRefresh={refreshAll}
            onResize={setUtilityWidth}
            onSendToChat={(text) =>
              onSendToChat({
                text,
                workspacePath: summary.root || workspacePath || "",
                projectScope,
              })
            }
            remotesResource={remotesResource}
            stashesResource={stashesResource}
            summary={summary}
            summaryLoading={summaryResource.loading}
            utilityPane={utilityPane}
            onUtilityPaneChange={setUtilityPane}
            width={utilityWidth}
            worktreeResource={worktreeResource}
            workspacePath={workspacePath}
          />
        ) : null}
      </div>
    </div>
  );
}
