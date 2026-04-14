import { createHash } from "node:crypto";
import type { classifyTurnMessage } from "@/runtime/turn-classification/message";
import type { deriveTurnExecutionPolicy } from "@/runtime/turn-classification/policy";

const INFORMATIONAL_RESPONSE_CACHE_TTL_MS = 45_000;

const informationalResponseCache = new Map<
  string,
  {
    expiresAt: number;
    text: string;
  }
>();

export function buildInformationalResponseCacheKey(input: {
  sessionId: string;
  provider: string;
  model: string;
  personalityId?: string;
  message: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.sessionId,
        input.provider,
        input.model,
        input.personalityId ?? "",
        input.message.trim(),
      ].join("\n"),
    )
    .digest("hex");
}

export function shouldUseInformationalResponseCache(input: {
  localInteractive: boolean;
  classification: ReturnType<typeof classifyTurnMessage>;
  policy: ReturnType<typeof deriveTurnExecutionPolicy>;
}): boolean {
  return (
    input.localInteractive &&
    !input.classification.likelyLocalTask &&
    !input.classification.requiresFullContext &&
    input.classification.informationalOnly &&
    !input.classification.actionOriented &&
    !input.policy.useMultiStep &&
    input.policy.maxIterations <= 1
  );
}

export function readInformationalResponseCache(
  key: string,
): string | undefined {
  const cached = informationalResponseCache.get(key);
  if (!cached) {
    return undefined;
  }
  if (cached.expiresAt <= Date.now()) {
    informationalResponseCache.delete(key);
    return undefined;
  }
  return cached.text;
}

export function writeInformationalResponseCache(
  key: string,
  text: string,
): void {
  informationalResponseCache.set(key, {
    expiresAt: Date.now() + INFORMATIONAL_RESPONSE_CACHE_TTL_MS,
    text,
  });

  if (informationalResponseCache.size <= 128) {
    return;
  }
  for (const [entryKey, value] of informationalResponseCache.entries()) {
    if (value.expiresAt <= Date.now()) {
      informationalResponseCache.delete(entryKey);
    }
    if (informationalResponseCache.size <= 96) {
      break;
    }
  }
}
