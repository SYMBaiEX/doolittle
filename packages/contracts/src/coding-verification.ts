/** Exact verifier used by the headless-workflows-v7 coding task. */
export const CODING_VERIFICATION_COMMAND = `node --input-type=module -e 'import assert from "node:assert/strict"; import { sumFinite } from "./math.mjs"; assert.equal(sumFinite([1, 2.5, "3", NaN, Infinity, -4]), -0.5); assert.equal(sumFinite([]), 0); assert.equal(sumFinite([1, "2", 2]), 3); process.stdout.write(JSON.stringify({file:"math.mjs",tests:"passed"})+"\\n");'`;

export const CODING_VERIFICATION_SUCCESS_MARKER =
  '{"file":"math.mjs","tests":"passed"}';

export const CODING_VERIFICATION_ID = "sum-finite-v1" as const;

export type CodingVerificationStatus = "verified" | "failed" | "unavailable";

export type CodingVerificationReason =
  | "verified"
  | "verifier-failed"
  | "marker-mismatch"
  | "verifier-ambiguous"
  | "identity-unavailable"
  | "foreign-context";

/**
 * Closed original runtime observation for a cooperative benchmark process
 * boundary; this is not OS-level or cryptographic attestation.
 */
export interface CodingVerificationReceipt {
  type: "coding-verification";
  timestamp: string;
  verifier: typeof CODING_VERIFICATION_ID;
  status: CodingVerificationStatus;
  reason: CodingVerificationReason;
  shellStarts: number;
  shellCompletions: number;
  verifierMatches: number;
  success: boolean;
  exitCode: number | null;
  timedOut: boolean | null;
  truncated: boolean | null;
  workdirMatches: boolean;
  actionPairMatched: boolean;
}
