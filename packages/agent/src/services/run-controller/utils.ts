export const nowIso = (): string => new Date().toISOString();

export const cloneRun = <T>(run: T): T => ({ ...run });
