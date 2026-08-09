import { getMemoryText, type Memory } from "@elizaos/core";

export function messageText(message: Memory): string {
  const content = message.content;
  if (typeof content === "string") return content;
  return content && typeof content === "object" ? getMemoryText(message) : "";
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
