export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
export const COMMON_BETAS = [
  "interleaved-thinking-2025-05-14",
  "fine-grained-tool-streaming-2025-05-14",
];
export const OAUTH_ONLY_BETAS = ["claude-code-20250219", "oauth-2025-04-20"];
export const CLAUDE_CODE_VERSION_FALLBACK = "2.1.74";
export const CLAUDE_CODE_SYSTEM_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude.";
export const CLAUDE_CODE_CLI_INFERENCE_SYSTEM_PROMPT =
  "You are the inference transport inside Doolittle, an ElizaOS agent. Follow the supplied conversation and output contract exactly. Eliza owns tools, planning, approvals, and lifecycle; do not run or simulate a second agent loop.";

export const CLAUDE_CODE_ANTHROPIC_VERSION = "2023-06-01";
