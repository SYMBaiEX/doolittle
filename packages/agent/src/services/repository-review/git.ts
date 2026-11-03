import { sanitizedOptionalText } from "./normalization";
import type {
  RepositoryReviewLocalSummary,
  RepositoryReviewProcessResult,
} from "./types";

function countStatusRecords(output: string): number {
  const records = output.split("\0").filter(Boolean);
  let count = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    count += 1;
    if (
      ["R", "C"].includes(record[0] ?? "") ||
      ["R", "C"].includes(record[1] ?? "")
    ) {
      index += 1;
    }
  }
  return count;
}

export function parseLocalSummary(
  root: string,
  results: RepositoryReviewProcessResult[],
): RepositoryReviewLocalSummary {
  const [
    branchResult,
    headResult,
    upstreamResult,
    aheadBehindResult,
    statusResult,
  ] = results;
  const branch =
    branchResult?.exitCode === 0
      ? sanitizedOptionalText(branchResult.stdout, 255)
      : undefined;
  const head =
    headResult?.exitCode === 0
      ? sanitizedOptionalText(headResult.stdout, 64)
      : undefined;
  const upstream =
    upstreamResult?.exitCode === 0
      ? sanitizedOptionalText(upstreamResult.stdout, 255)
      : undefined;
  const [behindRaw, aheadRaw] =
    aheadBehindResult?.exitCode === 0
      ? aheadBehindResult.stdout.trim().split(/\s+/u)
      : [];
  const changedFiles =
    statusResult?.exitCode === 0 ? countStatusRecords(statusResult.stdout) : 0;
  return {
    isRepository: true,
    root,
    branch,
    head,
    upstream,
    ahead: Number.parseInt(aheadRaw ?? "0", 10) || 0,
    behind: Number.parseInt(behindRaw ?? "0", 10) || 0,
    dirty: changedFiles > 0,
    changedFiles,
  };
}
