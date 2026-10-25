import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { truncate } from "../text-utils";

export function renderResponsesContent(context: AppContext): string {
  const responses = context.services.apiTransport.list(5);
  return [
    "{bold}Responses API{/}",
    `Records: ${responses.length}`,
    "",
    ...(responses.length
      ? responses.map(
          (entry) =>
            `- ${entry.id}\n  room=${truncate(entry.roomId, 20)} prev=${entry.previousResponseId ?? "n/a"}`,
        )
      : ["{gray-fg}No responses recorded yet.{/}"]),
  ].join("\n");
}
