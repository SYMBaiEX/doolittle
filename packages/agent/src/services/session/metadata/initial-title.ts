import { redactTrajectoryText } from "../../trajectory/event-journal";

const MAX_TITLE_LENGTH = 64;

/** Describe the first prompt without copying embedded context into the title. */
export function initialConversationTitle(text: string): string {
  const prompt = text
    .slice(0, 2_048)
    .split(
      /<(?:file_context|review_context|terminal_context|browser_evidence|doolittle-context)\b|\[Embedded resource:/iu,
      1,
    )[0]
    ?.trim();
  if (!prompt) return "New conversation";
  if (/^(?:```|~~~)/u.test(prompt)) return "Code discussion";
  const command = /^\/([a-z][\w-]{0,39})(?=\s|$)/iu.exec(prompt)?.[1];
  if (command) return `/${command}`;

  const redacted = redactTrajectoryText(prompt);
  if (
    redacted !== prompt ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-(?:proj-)?|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{12,}|\b(?:private[ _-]*key|password|secret|token)\s*[:=]/iu.test(
      prompt,
    )
  ) {
    return "Credential discussion";
  }

  const title = redacted
    .split(/\r?\n|[.!?](?=\s|$)/u, 1)[0]
    ?.replace(/^\s*(?:#{1,6}|>|[-*])\s+/u, "")
    .replace(/^(?:please\s+)?(?:(?:can|could|would) you\s+)?/iu, "")
    .replace(
      /(?:file:\/\/)?(?:[A-Za-z]:[\\/]|\/(?:Users|private|tmp|var|home|Volumes)\/)[^\s\]>)"']+/gu,
      (path) => path.split(/[\\/]/u).filter(Boolean).at(-1) ?? "",
    )
    .replace(/[`\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
  if (!title) return "New conversation";
  const characters = Array.from(title);
  if (characters.length <= MAX_TITLE_LENGTH) return title;
  const abbreviated = characters.slice(0, MAX_TITLE_LENGTH - 1).join("");
  const boundary = abbreviated.lastIndexOf(" ");
  return `${boundary >= 40 ? abbreviated.slice(0, boundary) : abbreviated}…`;
}
