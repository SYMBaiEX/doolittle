import { arch, hostname, platform, release } from "node:os";
import type { AppContext } from "@/runtime/bootstrap";

type ChatRuntimeContext = Pick<
  AppContext,
  "config" | "services" | "runtime"
> & {
  gateway?: AppContext["gateway"];
};

export function buildSimpleGreetingReply(message: string): string {
  const normalized = message.trim().toLowerCase();
  if (
    normalized === "how are you" ||
    normalized === "how are you today" ||
    normalized === "how are you doing" ||
    normalized === "how are you doing today" ||
    normalized === "how's it going" ||
    normalized === "how are things"
  ) {
    return "Doing well. What do you want to work on?";
  }
  if (normalized === "thanks" || normalized === "thank you") {
    return "Sure. What's next?";
  }
  if (normalized.startsWith("yo")) {
    return "Yo. What do you want to work on?";
  }
  if (normalized.startsWith("howdy")) {
    return "Howdy. What can I help you with?";
  }
  return "Hey! What can I help you with?";
}

export function isRecoverableNativePlanningError(error: unknown): boolean {
  const detail =
    error instanceof Error ? error.message.trim() : String(error).trim();
  const normalized = detail.toLowerCase();

  return [
    "dynamicpromptexecfromstate",
    "dynamic prompt",
    "parse error",
    "failed to parse",
    "unexpected token",
    "json",
  ].some((fragment) => normalized.includes(fragment));
}

export function buildNativePlanningFailureMessage(): string {
  return "The native planner hit a local prompt-shaping error on this turn. Try a more explicit command, or rerun with `/doctor` if it keeps happening.";
}

export function shouldAttachSystemFacts(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized || normalized.startsWith("/")) {
    return false;
  }
  return [
    "what pc",
    "what computer",
    "what machine",
    "what os",
    "which os",
    "what system",
    "macos",
    "windows",
    "linux",
    "darwin",
    "am i on",
    "use the terminal",
    "can you use the terminal",
    "can you run terminal",
    "what shell",
    "what platform",
  ].some((token) => normalized.includes(token));
}

export function buildSystemFactsContext(context: ChatRuntimeContext): string {
  const terminalAvailable = "yes";
  const settings = context.services.settings.get();
  return [
    "Live machine facts:",
    `- os=${platform()} ${release()}`,
    `- arch=${arch()}`,
    `- hostname=${hostname()}`,
    `- workspace=${context.config.workspaceDir}`,
    `- shell access=${terminalAvailable} via terminal service and /terminal run`,
    `- execution backend=${settings.execution.backend}`,
    `- provider=${settings.model.provider}`,
    "Use these live facts when answering machine or terminal capability questions. Do not say you cannot inspect the machine when local terminal access is available.",
  ].join("\n");
}
