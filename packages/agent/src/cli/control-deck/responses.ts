import { truncate } from "@/cli/text-utils";
import type { AppContext } from "@/runtime/bootstrap";

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
