import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import {
  clipControlDeckLine,
  clipControlDeckText,
  escapeControlDeckBlessed,
  normalizeControlDeckWidth,
  renderControlDeckHeading,
} from "./width";

function renderMutedLine(text: string, width: number): string {
  return `{gray-fg}${escapeControlDeckBlessed(clipControlDeckText(text, width))}{/}`;
}

export function renderResponsesContent(
  context: AppContext,
  width = 80,
): string {
  const contentWidth = normalizeControlDeckWidth(width);
  const responses = context.services.apiTransport.list(5);
  return [
    renderControlDeckHeading("Responses API", "Responses", contentWidth),
    clipControlDeckText(`Records: ${responses.length}`, contentWidth),
    "",
    ...(responses.length
      ? responses.map((entry) => {
          const id = clipControlDeckText(entry.id, contentWidth - 2);
          const roomPrefix = "  room=";
          const roomOnly = `${roomPrefix}${escapeControlDeckBlessed(
            clipControlDeckText(entry.roomId, contentWidth - roomPrefix.length),
          )}`;
          if (contentWidth < 40) {
            return `- ${escapeControlDeckBlessed(id)}\n${roomOnly}`;
          }
          const metadata = clipControlDeckLine(
            `  room=${entry.roomId} prev=${entry.previousResponseId ?? "n/a"}`,
            contentWidth,
          );
          return `- ${escapeControlDeckBlessed(id)}\n${escapeControlDeckBlessed(metadata)}`;
        })
      : [renderMutedLine("No responses recorded yet.", contentWidth)]),
  ].join("\n");
}
