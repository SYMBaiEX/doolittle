import { ThreadWorkbenchFilesPanel } from "../components/ThreadWorkbenchFilesPanel";
import { asString } from "../lib";
import { contextBlock } from "../thread-workbench-controller";
import type { WorkbenchController } from "./models";

type FilesPanelController = Pick<
  WorkbenchController,
  | "acpEditor"
  | "fileEntries"
  | "file"
  | "currentFile"
  | "currentFileLanguage"
  | "setSelectedFile"
  | "tree"
  | "insert"
>;

export function FilesPanel({
  controller,
  workspacePath,
  botId,
  sessionId,
}: {
  controller: FilesPanelController;
  workspacePath: string;
  botId?: string;
  sessionId?: string;
}) {
  const {
    acpEditor,
    fileEntries,
    file,
    currentFile,
    currentFileLanguage,
    setSelectedFile,
    tree,
    insert,
  } = controller;
  return (
    <ThreadWorkbenchFilesPanel
      botId={botId}
      originConversationId={sessionId}
      entries={fileEntries}
      file={file}
      onEditorStateChange={(snapshot) =>
        acpEditor.publishEditorState(snapshot, false)
      }
      onInsertFileContext={() =>
        insert(
          "File context added",
          contextBlock("file", currentFile, asString(file.data?.content)),
        )
      }
      onSelectPath={setSelectedFile}
      selectedLanguage={currentFileLanguage}
      selectedPath={currentFile}
      tree={tree}
      workspacePath={workspacePath}
    />
  );
}
