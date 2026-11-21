import { resolveHostExecutable } from "@elizaos/host";
import {
  type TextProcessOptions,
  textProcessCapabilities,
} from "../process-execution";
import type { RepositoryProcessRunner } from "./mutations";

export async function runGitPatchPreview(
  runner: RepositoryProcessRunner,
  args: readonly string[],
  options: TextProcessOptions,
  characterLimit: number,
) {
  // POSIX owned cancellation uses a transparent argv wrapper. Preserve normal
  // SDK execution where that wrapper is unavailable or would change decoding.
  if (
    process.platform === "win32" ||
    !textProcessCapabilities().ownedCancellation ||
    !resolveHostExecutable("/bin/sh")
  ) {
    return runner("git", args, options);
  }
  // Resolve Git against the SDK's boot PATH before entering the wrapper.
  const git = resolveHostExecutable("git");
  if (!git) return runner("git", args, options);

  const controller = new AbortController();
  let reportedDiagnostics = false;
  let received = 0;
  const result = await runner(git, args, {
    ...options,
    requireOwnedCancellation: true,
    abortSignal: controller.signal,
    onStderr() {
      reportedDiagnostics = true;
    },
    onStdout(chunk) {
      received += chunk.length;
      // The public patch removes a final CRLF. Two extra code units make
      // truncation unambiguous. When Git has issued diagnostics, wait for its
      // normal exit so warnings and failure messages keep their meaning.
      if (!reportedDiagnostics && received > characterLimit + 2)
        controller.abort();
    },
  });
  if (
    controller.signal.aborted &&
    result.exitCode === 130 &&
    result.stdout.length > characterLimit + 2 &&
    (result.stderr === "Command cancelled by operator." || !result.stderr)
  ) {
    return { ...result, exitCode: 0, stderr: "" };
  }
  return result;
}
