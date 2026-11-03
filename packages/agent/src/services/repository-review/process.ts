import {
  runTextProcess,
  TextProcessCancellationUnavailableError,
} from "../process-execution";
import type {
  RepositoryReviewProcessRunner,
  RepositoryReviewResult,
} from "./types";

const REVIEW_PROCESS_TIMEOUT_MS = 8_000;
const REVIEW_PROCESS_OUTPUT_BYTES = 512 * 1024;

type ProcessFailureKind =
  | "missing"
  | "timeout"
  | "output_limit"
  | "aborted"
  | "execution_unavailable";

export class RepositoryReviewProcessError extends Error {
  constructor(readonly kind: ProcessFailureKind) {
    super(kind);
  }
}

export const runRepositoryReviewProcess: RepositoryReviewProcessRunner =
  async ({ command, args, cwd, signal }) => {
    if (signal?.aborted) throw new RepositoryReviewProcessError("aborted");
    const controller = new AbortController();
    let failure: ProcessFailureKind | undefined;
    let outputBytes = 0;
    const stop = (kind: ProcessFailureKind) => {
      if (failure) return;
      failure = kind;
      controller.abort();
    };
    const abort = () => stop("aborted");
    signal?.addEventListener("abort", abort, { once: true });
    const countOutput = (chunk: string) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > REVIEW_PROCESS_OUTPUT_BYTES) {
        stop("output_limit");
      }
    };

    try {
      const result = await runTextProcess(command, args, {
        cwd,
        env: {
          GH_PROMPT_DISABLED: "1",
          GH_PAGER: "cat",
          NO_COLOR: "1",
        },
        timeoutMs: REVIEW_PROCESS_TIMEOUT_MS,
        abortSignal: controller.signal,
        requireOwnedCancellation: true,
        onStdout: countOutput,
        onStderr: countOutput,
        toolName: "doolittle.repository-review",
      });
      if (
        result.exitCode === 124 &&
        result.stderr.includes("[shell-router] command timed out")
      ) {
        failure = "timeout";
      }
      if (
        result.exitCode === -1 ||
        (result.exitCode === 127 && /\bnot found\b/iu.test(result.stderr))
      ) {
        failure = "missing";
      }
      if (failure) throw new RepositoryReviewProcessError(failure);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    } catch (error) {
      if (error instanceof TextProcessCancellationUnavailableError) {
        throw new RepositoryReviewProcessError("execution_unavailable");
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  };

export function classifyFailure(
  failure: unknown,
  missingTool?: "git" | "gh",
): Pick<NonNullable<RepositoryReviewResult["degraded"]>, "reason" | "detail"> {
  if (failure instanceof RepositoryReviewProcessError) {
    if (failure.kind === "execution_unavailable") {
      return {
        reason: "execution_unavailable",
        detail:
          "Repository review requires owned process cancellation to enforce its output limit, but the selected SDK execution policy does not provide it. No command was started and execution policy was not changed.",
      };
    }
    if (failure.kind === "missing" && missingTool) {
      return missingTool === "git"
        ? {
            reason: "git_unavailable",
            detail: "Git is not installed or is not available on PATH.",
          }
        : {
            reason: "gh_unavailable",
            detail: "GitHub CLI is not installed or is not available on PATH.",
          };
    }
    if (failure.kind === "timeout") {
      return {
        reason: "timeout",
        detail: "Repository review commands did not finish within 8 seconds.",
      };
    }
    if (failure.kind === "output_limit") {
      return {
        reason: "malformed_response",
        detail: "Repository review output exceeded the 512 KB safety limit.",
      };
    }
  }
  return {
    reason: "malformed_response",
    detail: "Repository review data could not be read safely.",
  };
}

export function looksLikeNoPullRequest(stderr: string): boolean {
  const message = stderr.toLowerCase();
  return (
    message.includes("no pull request") ||
    message.includes("no pull requests") ||
    message.includes("could not resolve to a pullrequest")
  );
}

export function looksLikeNetworkFailure(stderr: string): boolean {
  const message = stderr.toLowerCase();
  return [
    "network",
    "connection",
    "could not resolve host",
    "dial tcp",
    "tls handshake",
    "timeout",
    "timed out",
    "http 5",
    "graphql",
  ].some((needle) => message.includes(needle));
}

export function looksLikeAuthenticationFailure(stderr: string): boolean {
  const message = stderr.toLowerCase();
  return [
    "not logged in",
    "authentication",
    "requires authentication",
    "bad credentials",
    "http 401",
  ].some((needle) => message.includes(needle));
}
