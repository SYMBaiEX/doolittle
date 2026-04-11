import { inspect } from "node:util";
import { sanitizeTerminalText } from "@/cli/render-utils";

function sanitizeForeignTerminalWrite(text: string): string {
  return sanitizeTerminalText(text);
}

export function formatForeignTerminalArgs(args: unknown[]): string {
  return sanitizeForeignTerminalWrite(
    args
      .map((value) => {
        if (typeof value === "string") {
          return value;
        }
        return inspect(value, {
          depth: 4,
          colors: false,
          compact: true,
          breakLength: 120,
        });
      })
      .join(" "),
  );
}

export function shouldSuppressForeignTerminalLine(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("dynamicpromptexecfromstate failed") ||
    normalized.includes("no settings state found for server") ||
    normalized.includes("[plugin:advanced-capabilities:action:settings]") ||
    normalized.includes("[batchembeddings] api error:") ||
    normalized.includes("error creating relationship") ||
    normalized.includes("error updating relationship") ||
    normalized.includes("failed query:") ||
    normalized.includes('"relationships"."source_entity_id"') ||
    normalized.includes("model call failed:") ||
    normalized.includes("was there a typo in the url or port") ||
    normalized.includes("is the computer able to access the url")
  );
}

export function shouldDeferForeignOutput(
  textEntryFocused: boolean,
  overlaysOpen: boolean,
): boolean {
  return textEntryFocused || overlaysOpen;
}
