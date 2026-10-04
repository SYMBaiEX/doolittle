import { hasExplicitNoToolsIntent } from "@/runtime/no-tools-intent";

export type ExactOutputIntent = "json" | "json-object" | "verbatim";
const OUTPUT_VERB = /\b(?:return|reply|respond|output|print)\b/iu;
const RESPONSE_DIRECTIVE =
  /\b(?:final\s+)?(?:response|reply|answer)\s+(?:must|should)\b/iu;
const CONDITIONAL =
  /\b(?:if|when|unless|until|except|otherwise|provided|conditional)\b/iu;
const FORMATTING =
  "(?:prose|markdown|commentary|explanation|code\\s+fences?|added\\s+text|extra\\s+text|other\\s+text)";
const FORMATTING_BAN = new RegExp(
  `^\\s*(?:do\\s+not|don['’]t|never)\\s+(?:add|include|append|use)\\s+(?:any\\s+)?${FORMATTING}(?:\\s*(?:,|or|and)\\s*${FORMATTING})*\\s*$`,
  "iu",
);

// Keep JSON-body delivery syntax while discarding the literal's keys/values.
function maskJsonBodies(input: string): string | undefined {
  let output = "";
  // Shared across candidates: malformed nested openers must not each rescan
  // the full body window. Exhaustion rejects the entire delivery instruction.
  let remainingScanChars = 64_000;
  for (let index = 0; index < input.length; index += 1) {
    const first = input[index];
    if (first !== "{" && first !== "[") {
      output += first;
      continue;
    }
    const stack: string[] = [];
    let quoted = false;
    let escaped = false;
    let accepted = false;
    for (
      let end = index;
      end < Math.min(input.length, index + 4_000);
      end += 1
    ) {
      if (remainingScanChars === 0) return undefined;
      remainingScanChars -= 1;
      const char = input[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") stack.push(char);
      else if (char === "}" || char === "]") {
        if (stack.pop() !== (char === "}" ? "{" : "[")) break;
        if (stack.length === 0) {
          try {
            JSON.parse(input.slice(index, end + 1));
            output += "\uE000";
            index = end;
            accepted = true;
          } catch {
            /* Not a structured JSON literal. */
          }
          break;
        }
      }
    }
    if (!accepted) output += first;
  }
  return output;
}

function deliveryIntent(body: string): ExactOutputIntent | undefined {
  const withoutFormatting = body
    .replace(
      /\s+with\s+no\s+(?:code\s+fences?|added\s+text|other\s+text|extra\s+text|prose|markdown)(?:\s+or\s+(?:code\s+fences?|added\s+text|other\s+text|extra\s+text|prose|markdown))*(?=\s*:|\s*$)/iu,
      "",
    )
    .trim();
  if (
    /^(?:(?:only|exactly)\s+(?:with\s+)?(?:the\s+)?(?:exact\s+)?|(?:the\s+)?exact\s+)(?:(?:its|the|command)\s+)?(?:(?:success|failure)\s+)?(?:json(?:\s+(?:body|output|object|array))?|\uE000)(?:\s+(?:byte-for-byte|verbatim|exactly))?(?:\s*:?\s+\uE000|\s*:\s*\uE000)?$/iu.test(
      withoutFormatting,
    )
  )
    return "json";
  if (
    /^(?:only\s+)?(?:the\s+)?(?:command\s+)?stdout\s+(?:exactly|verbatim|byte-for-byte)\s*$/iu.test(
      withoutFormatting,
    ) ||
    /^(?:only\s+)?(?:the\s+)?command\s+output\s+(?:exactly|verbatim|byte-for-byte)\s*$/iu.test(
      withoutFormatting,
    ) ||
    /^(?:exactly|verbatim)\s+(?:the\s+)?(?:command\s+)?stdout\s*$/iu.test(
      withoutFormatting,
    )
  )
    return "verbatim";
  return undefined;
}

/** Delivery intent only: clean receipts and completion gates prove execution. */
export function resolveExactOutputIntent(
  userRequest: string,
): ExactOutputIntent | undefined {
  if (userRequest.length > 32_000 || userRequest.includes("\uE000"))
    return undefined;
  const masked = maskJsonBodies(userRequest);
  if (masked === undefined) return undefined;
  const instructions = masked
    .replace(
      /```[\s\S]*?(?:```|$)|`[^`\n]*`|"(?:\\.|[^"\\])*"|“[^”]*”|(?:^|\s)'[^'\n]+'|‘[^’]*’/gu,
      " ",
    )
    .replace(/^\s*>.*$/gmu, " ");
  if (
    hasExplicitNoToolsIntent(userRequest) ||
    /\b(?:without\s+(?:using\s+|running\s+|executing\s+|invoking\s+)?(?:any\s+|a\s+)?(?:tools?|shell|commands?|terminal)|no\s+(?:tools?|shell|commands?|terminal)|(?:skip|disallow|prohibit)\s+(?:running\s+|using\s+)?(?:tools?|shell|commands?|terminal))\b/iu.test(
      instructions,
    ) ||
    /\b(?:do\s+not|don['’]t|must\s+not|mustn['’]t|never|avoid|refrain\s+from)\s+(?:run|execute|use|invoke|call|start|launch|open)\b[^.;\n]*\b(?:tools?|shell|commands?|terminal)\b/iu.test(
      instructions,
    )
  )
    return undefined;

  let intent: ExactOutputIntent | undefined;
  let awaitingPreservation = false;
  let branch:
    | { subject: string; success: boolean; paired: boolean }
    | undefined;
  for (const rawClause of instructions.split(/[.!?](?=\s|$)|[;\n]/u)) {
    let clause = rawClause.trim();
    if (awaitingPreservation) {
      if (
        !/^(?:please\s+)?preserve\s+its\s+exact\s+bytes\s+and\s+formatting$/iu.test(
          clause,
        )
      )
        return undefined;
      intent = "verbatim";
      awaitingPreservation = false;
      continue;
    }
    if (!clause || FORMATTING_BAN.test(clause)) continue;
    if (
      /^(?:the\s+)?(?:command\s+)?(?:output|stdout)\s+is\s+(?:the\s+)?final\s+(?:answer|response)$/iu.test(
        clause,
      )
    ) {
      if (intent || branch) return undefined;
      awaitingPreservation = true;
      continue;
    }
    // Unlike outcome conditions, this shape predicate is decidable from the
    // candidate. The synthesis guard must prove a JSON object, not an array.
    if (
      /^if\s+(?:the\s+)?(?:command\s+)?(?:output|stdout)\s+is\s+a\s+json\s+object\s*,\s*(?:then\s+)?make\s+that\s+object\s+your\s+final\s+(?:response|answer)$/iu.test(
        clause,
      )
    ) {
      if (intent || branch) return undefined;
      intent = "json-object";
      continue;
    }
    if (
      /\b(?:no|without|not|avoid|never)\s+(?:\w+\s+){0,3}(?:json|stdout|command\s+output)\b/iu.test(
        clause,
      )
    )
      return undefined;
    const condition =
      /^(?:if|when|on)\s+(?:the\s+)?(command|check|test|verifier)\s+(success|succeeds|passes|succeeded|failure|fails|failed)\s*,?\s*(?:then\s+)?/iu.exec(
        clause,
      );
    const otherwise = /^otherwise\s*,?\s*/iu.exec(clause);
    if (condition) {
      const subject = condition[1].toLowerCase();
      const success = /^(?:success|succeeds|passes|succeeded)$/iu.test(
        condition[2],
      );
      if (
        branch &&
        (branch.paired ||
          branch.subject !== subject ||
          branch.success === success)
      )
        return undefined;
      if (intent && !branch) return undefined;
      branch = branch
        ? { ...branch, paired: true }
        : { subject, success, paired: false };
      clause = clause.slice(condition[0].length);
    } else if (otherwise) {
      if (!branch || branch.paired) return undefined;
      branch.paired = true;
      clause = clause.slice(otherwise[0].length);
    } else if (CONDITIONAL.test(clause)) return undefined;

    const directive =
      /^(?:please\s+)?(?:return|reply|respond|output|print)\s+(.*)$/iu.exec(
        clause,
      ) ??
      /^(?:the\s+)?(?:final\s+)?(?:response|reply|answer)\s+(?:must|should)\s+be\s+(.*)$/iu.exec(
        clause,
      );
    if (!directive) {
      if (
        condition ||
        otherwise ||
        OUTPUT_VERB.test(clause) ||
        RESPONSE_DIRECTIVE.test(clause) ||
        /\bpreserve\b.*\b(?:bytes|formatting)\b/iu.test(clause) ||
        /\b(?:explain|summarize|describe|append|include|prose|markdown|explanation|summary)\b/iu.test(
          clause,
        )
      )
        return undefined;
      continue;
    }
    const next = deliveryIntent(directive[1]);
    if (
      !next ||
      (intent && ((!condition && !otherwise) || intent !== next)) ||
      (branch && next !== "json")
    )
      return undefined;
    intent = next;
  }
  if (awaitingPreservation || (branch && !branch.paired)) return undefined;
  return intent;
}
