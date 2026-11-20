import { getCliErrorMessage } from "../cli/execution/types";

export function isRecoverableTopLevelRuntimeError(error: unknown): boolean {
  const normalized = getCliErrorMessage(error).toLowerCase();
  return [
    "cannot connect to api",
    "unable to connect",
    "failedtoopensocket",
    "connectionrefused",
    "rate limit",
    "unauthorized",
    "no output generated",
    "database is shutting down",
    "operation rejected",
    "pglite startup failed after automatic recovery",
  ].some((fragment) => normalized.includes(fragment));
}
