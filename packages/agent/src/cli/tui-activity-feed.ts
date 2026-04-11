import { asciiActivityBadge, toneTag } from "@/cli/activity-chrome";
import { escapeBlessed } from "@/cli/render-utils";
import { truncate } from "@/cli/text-utils";
import type { CliExecutionResult, CliState } from "./execution";

type ActivityTone = CliExecutionResult["tone"];

interface ActivityPaneLike {
  log(content: string): void;
}

interface DeferredForeignActivity {
  kind: string;
  message: string;
  tone: ActivityTone;
}

interface CreateTuiActivityFeedOptions {
  activityPane: ActivityPaneLike;
  state: CliState;
  shouldDeferForeignActivity(): boolean;
  scheduleRefreshPanels(delayMs?: number): void;
}

export function createTuiActivityFeed(options: CreateTuiActivityFeedOptions) {
  const deferredForeignActivity: DeferredForeignActivity[] = [];
  let deferredForeignRefreshTimer: NodeJS.Timeout | null = null;

  function appendActivity(
    kind: string,
    message: string,
    tone: ActivityTone,
  ): void {
    options.activityPane.log(
      `{gray-fg}${nowStamp()}{/} ${toneTag(tone)} {gray-fg}${escapeBlessed(asciiActivityBadge(kind))}{/} {bold}${escapeBlessed(kind)}{/bold} ${escapeBlessed(message)}`,
    );
  }

  function pushNotice(kind: "context" | "skills" | "status", message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    const existingIndex = options.state.notices.findIndex(
      (entry) => entry.kind === kind && entry.message === trimmed,
    );
    if (existingIndex >= 0) {
      options.state.notices.splice(existingIndex, 1);
    }
    options.state.notices.unshift({
      kind,
      message: trimmed,
      at: nowStamp(),
    });
    if (options.state.notices.length > 6) {
      options.state.notices.splice(6);
    }
  }

  function flushDeferredForeignActivity(): void {
    if (
      options.shouldDeferForeignActivity() ||
      deferredForeignActivity.length === 0
    ) {
      return;
    }

    for (const entry of deferredForeignActivity.splice(
      0,
      deferredForeignActivity.length,
    )) {
      appendActivity(entry.kind, entry.message, entry.tone);
    }
  }

  function scheduleDeferredForeignRefresh(delayMs = 90): void {
    if (deferredForeignRefreshTimer) {
      return;
    }
    deferredForeignRefreshTimer = setTimeout(() => {
      deferredForeignRefreshTimer = null;
      flushDeferredForeignActivity();
      options.scheduleRefreshPanels(0);
    }, delayMs);
    deferredForeignRefreshTimer.unref?.();
  }

  function routeForeignActivity(
    source: "stdout" | "stderr" | "console",
    text: string,
  ): void {
    const nextEntry = {
      kind:
        source === "stdout" ? "srv+" : source === "stderr" ? "srv!" : "log!",
      message: truncate(text, 220),
      tone: source === "stdout" ? ("info" as const) : ("warning" as const),
    };

    if (options.shouldDeferForeignActivity()) {
      deferredForeignActivity.push(nextEntry);
      scheduleDeferredForeignRefresh();
      return;
    }

    appendActivity(nextEntry.kind, nextEntry.message, nextEntry.tone);
    options.scheduleRefreshPanels(0);
  }

  function dispose(): void {
    if (deferredForeignRefreshTimer) {
      clearTimeout(deferredForeignRefreshTimer);
      deferredForeignRefreshTimer = null;
    }
  }

  return {
    appendActivity,
    pushNotice,
    flushDeferredForeignActivity,
    scheduleDeferredForeignRefresh,
    routeForeignActivity,
    dispose,
  };
}

function nowStamp(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
