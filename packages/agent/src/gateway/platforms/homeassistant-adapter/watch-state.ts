import type { PlatformHealth } from "../base";

export type HomeAssistantWatchState = {
  lastWatchAt?: string;
  lastWatchCount?: number;
  lastWatchSummary?: string;
};

export function createHomeAssistantWatchState(): HomeAssistantWatchState {
  return {};
}

export function recordHomeAssistantWatch(
  state: HomeAssistantWatchState,
  watch: {
    watchedAt: string;
    count: number;
    summary: string;
  },
): void {
  state.lastWatchAt = watch.watchedAt;
  state.lastWatchCount = watch.count;
  state.lastWatchSummary = watch.summary;
}

export function applyHomeAssistantWatchHealth(
  health: PlatformHealth,
  state: HomeAssistantWatchState,
): PlatformHealth {
  return {
    ...health,
    lastWatchAt: state.lastWatchAt,
    lastWatchCount: state.lastWatchCount,
    lastWatchSummary: state.lastWatchSummary,
  };
}
