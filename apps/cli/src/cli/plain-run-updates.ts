import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import {
  formatRunEvent,
  shouldRenderRunEvent,
} from "@doolittle/agent/runtime/run-progress";
import { asciiRunBadge } from "./activity-chrome";
import { renderPlainRunLine } from "./shell-chrome";

interface PlainRunUpdateOptions {
  context: AppContext;
  sessionId: string;
  interactiveShell: boolean;
  output: NodeJS.WriteStream;
  getLastRenderedKey: () => string;
  setLastRenderedKey: (value: string) => void;
}

export function subscribePlainRunUpdates(
  options: PlainRunUpdateOptions,
): () => void {
  const {
    context,
    sessionId,
    interactiveShell,
    output,
    getLastRenderedKey,
    setLastRenderedKey,
  } = options;
  return context.services.runController.onUpdate((event) => {
    if (!interactiveShell) {
      return;
    }
    if (event.sessionId !== sessionId) {
      return;
    }
    if (!shouldRenderRunEvent(event.run.progressMode, event)) {
      return;
    }
    const detail = formatRunEvent(event);
    if (!detail) {
      return;
    }
    const renderKey = `${event.type}:${detail}`;
    if (renderKey === getLastRenderedKey()) {
      return;
    }
    setLastRenderedKey(renderKey);
    output.write(`\n${renderPlainRunLine(detail, asciiRunBadge(detail))}\n`);
  });
}
