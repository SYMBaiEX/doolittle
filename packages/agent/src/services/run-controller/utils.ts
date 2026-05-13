import type { RunSnapshot } from "./types";

export const nowIso = (): string => new Date().toISOString();

export const cloneRun = (run: RunSnapshot): RunSnapshot => ({
  ...run,
  localMutations: run.localMutations.map((mutation) => ({ ...mutation })),
});
