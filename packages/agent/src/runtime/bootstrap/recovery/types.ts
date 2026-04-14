export type PgliteRecoveryAction =
  | "none"
  | "retry-without-reset"
  | "reset-data-dir"
  | "fail-active-lock";

export type PglitePidFileStatus =
  | "missing"
  | "active"
  | "active-unconfirmed"
  | "cleared-stale"
  | "cleared-malformed"
  | "check-failed";
