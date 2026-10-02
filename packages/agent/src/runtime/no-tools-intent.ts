const TOOL_OPERATION =
  "(?:use|using|invoke|invoking|call|calling|run|running|execute|executing)\\s+(?:any\\s+)?tools\\b";

const EXPLICIT_PROHIBITION = new RegExp(
  `\\b(?:do\\s+not|don['’]t|must\\s+not|mustn['’]t|never|avoid|refrain\\s+from)\\s+(?:(?:run|execute)\\s+(?:any\\s+)?(?:shell\\s+)?commands\\s*,?\\s*(?:or|and)\\s+)?${TOOL_OPERATION}`,
  "iu",
);
const TOOL_FREE_REQUEST =
  /\b(?:use\s+no\s+tools|without\s+(?:using\s+)?(?:any\s+)?tools)\b/iu;
const CONDITIONAL_SCOPE = /\b(?:unless|except|until|if|when|other\s+than)\b/iu;

/**
 * Recognize explicit, unconditional bans on tools in the current instruction.
 * This is deliberately not a general natural-language permission parser:
 * examples, conditional exceptions, and bans on a subset of tools are left to
 * normal routing. Never change runtime-wide policy for a single-message ban.
 */
export function hasExplicitNoToolsIntent(message: string): boolean {
  const instructions = message
    .replace(
      /```[\s\S]*?(?:```|$)|`[^`\n]*`|"(?:\\.|[^"\\])*"|“[^”]*”|(?:^|\s)'[^'\n]+'|‘[^’]*’/gu,
      " ",
    )
    .replace(/^\s*>.*$/gmu, " ");

  return instructions.split(/[.!?](?=\s|$)|[;\n]/u).some((clause) => {
    if (CONDITIONAL_SCOPE.test(clause)) return false;
    const match =
      EXPLICIT_PROHIBITION.exec(clause) ?? TOOL_FREE_REQUEST.exec(clause);
    if (!match) return false;
    if (
      EXPLICIT_PROHIBITION.test(match[0]) &&
      /\b(?:explain|discuss|quote|sentence|phrase|example|whether)\b/iu.test(
        clause.slice(0, match.index),
      )
    ) {
      return false;
    }
    // "tool outputs" and "tools for sending mail" aren't blanket bans.
    const suffix = clause.slice(match.index + match[0].length);
    if (
      /^\s+for\s+(?:this|the)\s+(?:task|turn|request|response)\b/iu.test(suffix)
    ) {
      return true;
    }
    if (
      /^['’]?\s*(?:[-/]\s*)?(?:outputs?|results?|names?|arguments?|calls?|for|to|that|which)\b/iu.test(
        suffix,
      )
    ) {
      return false;
    }
    return true;
  });
}
