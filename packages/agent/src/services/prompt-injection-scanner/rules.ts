import type { InjectionRule } from "./types";

export const INJECTION_RULES: InjectionRule[] = [
  {
    id: "role-override-system",
    severity: "block",
    description: "Attempts to override the system role",
    pattern:
      /\b(?:ignore|disregard|forget|override)\b.{0,60}\b(?:previous|prior|above|all)\b.{0,60}\b(?:instructions?|prompts?|rules?|directives?)\b/isu,
  },
  {
    id: "new-system-prompt",
    severity: "block",
    description: "Attempts to inject a new system prompt",
    pattern:
      /\b(?:new|updated?|actual|real)\s+(?:system\s+)?(?:prompt|instructions?|directives?)\s*[:=]/isu,
  },
  {
    id: "persona-takeover",
    severity: "block",
    description: "Attempts to assume a different identity or disable safety",
    pattern:
      /\b(?:you\s+are\s+now|act\s+as|pretend\s+(?:you\s+are|to\s+be)|from\s+now\s+on)\b.{0,120}\b(?:dan|jailbreak|unrestricted|no\s+(?:limits?|restrictions?|rules?))\b/isu,
  },
  {
    id: "jailbreak-keyword",
    severity: "block",
    description: "Classic jailbreak keyword detected",
    pattern: /\b(?:jailbreak|do\s+anything\s+now|DAN|AIM\s+mode)\b/isu,
  },
  {
    id: "disable-safety",
    severity: "warn",
    description: "Attempts to disable safety filters or content policies",
    pattern:
      /\b(?:disable|bypass|skip|ignore)\b.{0,60}\b(?:safety|filter|moderation|policy|policies|restriction|guardrail)\b/isu,
  },
  {
    id: "hidden-unicode",
    severity: "warn",
    description:
      "Contains zero-width or invisible Unicode characters often used to hide instructions",
    pattern: /[\u200B-\u200F\u2060\u2061\u2062\u2063\uFEFF]/u,
  },
  {
    id: "base64-blob",
    severity: "warn",
    description:
      "Contains a suspicious base64-encoded blob that may hide instructions",
    pattern: /(?:[A-Za-z0-9+/]{20,}={0,2}\s*){3,}/u,
  },
  {
    id: "html-script-tag",
    severity: "block",
    description:
      "Contains a <script> tag which models may execute conceptually",
    pattern: /<script\b[^>]*>/isu,
  },
  {
    id: "suspicious-xml-tag",
    severity: "warn",
    description:
      "Contains XML-like tags that could be mistaken for model control tokens",
    pattern:
      /<\/?\s*(?:system|prompt|instruction|task|tool_call|function_call|tool_result)\s*(?:\s[^>]*)?\s*>/isu,
  },
  {
    id: "grant-permissions",
    severity: "warn",
    description:
      "Attempts to grant elevated permissions or capabilities to the agent",
    pattern:
      /\b(?:you\s+(?:now\s+)?have\s+(?:full|admin|root|sudo|elevated|unrestricted))\b/isu,
  },
  {
    id: "reveal-system-prompt",
    severity: "warn",
    description: "Instructs the agent to reveal its system prompt or secrets",
    pattern:
      /\b(?:reveal|print|output|show|display|repeat|echo)\b.{0,60}\b(?:system\s+prompt|your\s+instructions?|your\s+rules?|api\s+key|secret)\b/isu,
  },
  {
    id: "exfil-data",
    severity: "block",
    description: "Attempts to exfiltrate data via URLs or webhooks",
    pattern:
      /\b(?:send|post|fetch|curl|wget|upload|exfil)\b.{0,80}https?:\/\/(?!(?:github\.com|anthropic\.com|openai\.com|elizaos\.ai))/isu,
  },
  {
    id: "separator-marker",
    severity: "info",
    description:
      "Contains common prompt-injection separator markers (-----, ===, etc.)",
    pattern: /^(?:-{5,}|={5,}|\*{5,}|#{5,})\s*$/mu,
  },
  {
    id: "end-of-text-marker",
    severity: "info",
    description: "Contains an <|endoftext|> or similar special token",
    pattern: /<\|(?:endoftext|im_start|im_end|system|user|assistant)\|>/isu,
  },
];
