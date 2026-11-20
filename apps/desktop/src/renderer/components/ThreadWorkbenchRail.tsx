import type { ThreadWorkbenchTab } from "../thread-workbench";
import type { ThreadWorkbenchFullView } from "../thread-workbench/models";
import { WorkbenchPanels } from "../thread-workbench/WorkbenchPanels";
import { useThreadWorkbenchRailController } from "../thread-workbench-controller";

export function ThreadWorkbenchRail({
  active,
  botId,
  tab,
  sessionId,
  workspacePath,
  onInsertContext,
  onOpenFullView,
}: {
  active: boolean;
  botId?: string;
  tab: ThreadWorkbenchTab;
  sessionId: string;
  workspacePath: string;
  onInsertContext: (text: string) => void;
  onOpenFullView: (view: ThreadWorkbenchFullView) => void;
}) {
  const controller = useThreadWorkbenchRailController({
    active,
    selectedTab: tab,
    botId,
    sessionId,
    workspacePath,
    onInsertContext,
  });
  return (
    <div className="thread-workbench flex h-full min-h-0 flex-col overflow-hidden">
      <WorkbenchPanels
        {...{ botId, controller, onOpenFullView, sessionId, workspacePath }}
      />
      <span aria-live="polite" className="sr-only">
        {controller.copiedLabel
          ? `Added ${controller.copiedLabel} to the draft`
          : ""}
      </span>
    </div>
  );
}
