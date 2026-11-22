import { ContextActionMenu, PanelTabList } from "@doolittle/ui";
import { ChevronDown, X } from "lucide-react";
import {
  type ComponentProps,
  cloneElement,
  type ReactElement,
  useEffect,
} from "react";
import { UiIcon } from "../components/UiIcon";
import { WorkspaceFileIcon } from "../components/WorkspaceFileIcon";
import { copyContextText } from "../context-menu-clipboard";
import { fileName } from "./models";

export interface OpenEditorDocument {
  path: string;
  dirty: boolean;
}

export function editorDocumentTabId(panelId: string, path: string): string {
  return `${panelId}-document-${encodeURIComponent(path)}`;
}

export function OpenEditorTabs({
  documents,
  selectedPath,
  panelId,
  disabled,
  scopeKey,
  onOpen,
  onClose,
}: {
  documents: readonly OpenEditorDocument[];
  selectedPath: string;
  panelId: string;
  disabled: boolean;
  scopeKey: string;
  onOpen: (path: string) => boolean;
  onClose: (path: string) => boolean;
}) {
  useEffect(() => {
    if (!selectedPath) return;
    const tab = document.getElementById(
      editorDocumentTabId(panelId, selectedPath),
    );
    tab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [panelId, selectedPath]);

  if (documents.length === 0) return null;

  const nameCounts = new Map<string, number>();
  const dirtyFiles = new Set<string>();
  for (const { path, dirty } of documents) {
    const name = fileName(path);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    if (dirty) dirtyFiles.add(path);
  }
  const items = documents.map(({ path, dirty }) => {
    const name = fileName(path);
    const duplicate = (nameCounts.get(name) ?? 0) > 1;
    return {
      id: path,
      title: dirty ? `${path} (unsaved edits)` : path,
      buttonId: editorDocumentTabId(panelId, path),
      panelId,
      label: (
        <>
          <WorkspaceFileIcon path={path} />
          <span className="ide-document-name">{name}</span>
          {duplicate ? <span className="sr-only">{` · ${path}`}</span> : null}
          {duplicate ? (
            <span className="ide-document-folder" aria-hidden="true">
              {path.slice(0, -(name.length + 1))}
            </span>
          ) : null}
          {dirty ? <span className="sr-only">Unsaved edits</span> : null}
        </>
      ),
    };
  });

  function closeDocument(path: string) {
    if (!onClose(path)) return;
    const index = documents.findIndex((document) => document.path === path);
    const next =
      path === selectedPath
        ? (documents[index + 1]?.path ?? documents[index - 1]?.path)
        : selectedPath;
    requestAnimationFrame(() => {
      const control = next
        ? document.getElementById(editorDocumentTabId(panelId, next))
        : document.getElementById(panelId);
      control?.focus();
    });
  }

  return (
    <div className="ide-document-bar">
      <PanelTabList
        className="ide-document-tabs"
        items={items}
        label="Open editors"
        onSelect={(path) => {
          if (!disabled) onOpen(path);
        }}
        selected={selectedPath}
        tabClassName="ide-document-tab"
        wrapTab={(item, tab) => {
          const dirty = dirtyFiles.has(item.id);
          return (
            <ContextActionMenu
              key={item.id}
              className="ide-document-item"
              disabled={disabled}
              items={[
                {
                  id: "open",
                  label: "Open editor",
                  onSelect: () => {
                    onOpen(item.id);
                  },
                },
                {
                  id: "copy",
                  label: "Copy relative path",
                  onSelect: () => copyContextText(item.id),
                },
                {
                  id: "close",
                  label: "Close editor",
                  onSelect: () => closeDocument(item.id),
                },
              ]}
              label={`Editor: ${item.id}`}
              scopeKey={`${scopeKey}:${item.id}`}
            >
              {cloneElement(tab as ReactElement<ComponentProps<"button">>, {
                "aria-keyshortcuts": "Delete",
                disabled,
                onKeyDown: (event) => {
                  if (event.key !== "Delete") return;
                  event.preventDefault();
                  closeDocument(item.id);
                },
                onAuxClick: (event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  closeDocument(item.id);
                },
              })}
              <button
                aria-label={`Close ${fileName(item.id)}`}
                className="ide-tab-close"
                data-dirty={dirty || undefined}
                disabled={disabled}
                onClick={() => closeDocument(item.id)}
                title={
                  dirty ? "Close editor with unsaved edits" : "Close editor"
                }
                type="button"
              >
                <UiIcon icon={X} size="xs" />
              </button>
            </ContextActionMenu>
          );
        }}
      />
      <ContextActionMenu
        className="ide-document-overflow"
        disabled={disabled}
        items={documents.map(({ path, dirty }) => ({
          id: path,
          label: dirty ? `${path} · Unsaved` : path,
          onSelect: () => {
            onOpen(path);
          },
        }))}
        label="Open editors menu"
        scopeKey={scopeKey}
        trigger={
          <button title="Open editors menu" type="button">
            <UiIcon icon={ChevronDown} size="xs" />
          </button>
        }
      >
        <span className="sr-only">{`${documents.length} open editors`}</span>
      </ContextActionMenu>
    </div>
  );
}
