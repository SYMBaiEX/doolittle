import type { ActionResult } from "@elizaos/core";
import {
  actionResultActionName,
  extractCommandResultFromActionResult,
  extractLocalMutationsFromActionResult,
} from "@/runtime/action-result-metadata";
import {
  interactiveTextSummary,
  readInteractiveTextCheck,
} from "@/services/web/interactive-text-check";
import { isRecord } from "@/utils/records";
import { inspectWorkspaceCommands } from "@/utils/workspace-commands";
import {
  admittedWorkspace,
  chronologyUnverified,
  hasVerifiedWorkspaceMutation,
  missingWorkspaceMutationRequirements,
} from "./workspace-evidence";
import type { WorkspaceNoopRequirements } from "./workspace-noop-completion";

const FRONTEND_FILE =
  /(?:^|\/)(?![^/]*\.(?:test|spec)\.)[^/]+\.(?:tsx|jsx|css|scss|sass|less|html|vue|svelte|svg|png|jpe?g|webp|gif|avif)$/iu;

export function unquotedServerInstructions(userRequest: string): string {
  // Match the workspace-intent gate's distinction between instructions and
  // reference text. Mask only the quoted/code spans, preserving surrounding
  // instructions and offsets; contractions are not opening quote delimiters.
  return userRequest.replace(
    /```[\s\S]*?(?:```|(?![\s\S]))|~~~[\s\S]*?(?:~~~|(?![\s\S]))|`[^`\n]*`|"(?:\\.|[^"\\])*"|“[^”]*”|(?<![\p{L}\p{N}_])'(?:\\.|[^'\\\n]|'(?=\p{L}))*'|‘(?:[^’]|’(?=\p{L}))*’|^\s*>[^\n]*/gmu,
    (reference) => " ".repeat(reference.length),
  );
}

export function serverStartPolicy(userRequest: string): {
  verificationRequest: string;
  forbidden: boolean;
} {
  const instructions = unquotedServerInstructions(userRequest);
  const negative =
    /\b(?:do\s+not|don['’]t|never)\s+(?:change\s+(?:the\s+)?ui\s+(?:or|and)\s+)?(?:start|restart|launch|serve|preview|open|run)\s+(?:(?:a|an|any|the)\s+)?(?:app(?:lication)?|(?:dev(?:elopment)?\s+)?server|website|web\s+app|site)\b/giu;
  const matches = [...instructions.matchAll(negative)];
  const latest = matches[matches.length - 1];
  const laterRequest = latest
    ? instructions.slice(latest.index + latest[0].length).replace(negative, "")
    : "";
  return {
    // Only verification intent uses this text; the original request, including
    // every user constraint, remains unchanged in the model's memory.
    verificationRequest: instructions.replace(negative, ""),
    forbidden:
      Boolean(latest) &&
      !/\b(?:start|restart|launch|serve|preview|open|run)\s+(?:(?:a|an|any|the)\s+)?(?:app(?:lication)?|(?:dev(?:elopment)?\s+)?server|website|web\s+app|site)\b/iu.test(
        laterRequest,
      ),
  };
}

export function frontendReviewRequired(
  actionResults: readonly ActionResult[],
  userRequest: string,
): boolean {
  const mutations = actionResults.flatMap((result) =>
    extractLocalMutationsFromActionResult(result).filter(
      (mutation) => mutation.success,
    ),
  );
  return (
    mutations.some(
      (mutation) =>
        typeof mutation.resolvedPath === "string" &&
        FRONTEND_FILE.test(mutation.resolvedPath),
    ) ||
    (mutations.length > 0 &&
      // Framework names also describe backend/API work. Intent-only activation
      // needs an explicit user-facing surface; visual file receipts still win.
      /\b(?:create|build|implement|make|develop|scaffold)\b[\s\S]{0,100}\b(?:frontend|front-end|website|web\s+app|landing\s+page|user\s+interface)\b/iu.test(
        userRequest,
      ))
  );
}

export function frontendRequirements(
  actionResults: readonly ActionResult[],
  requirements: WorkspaceNoopRequirements,
  userRequest: string,
): WorkspaceNoopRequirements {
  return frontendReviewRequired(actionResults, userRequest)
    ? { ...requirements, requireBuild: true, requireManagedApplication: true }
    : requirements;
}

export function frontendReviewBlockedByUserConstraint(
  actionResults: readonly ActionResult[],
  requirements: WorkspaceNoopRequirements,
  userRequest: string,
): boolean {
  return (
    serverStartPolicy(userRequest).forbidden &&
    frontendReviewRequired(actionResults, userRequest) &&
    missingWorkspaceMutationRequirements(
      actionResults,
      frontendRequirements(actionResults, requirements, userRequest),
    ).some((requirement) =>
      requirement.startsWith("a ready managed app server"),
    )
  );
}

export const CONSTRAINED_FRONTEND_REVIEW_FAILURE =
  "The frontend files changed, but browser review is unavailable and was not attempted: your instruction forbids starting or restarting a server, and no current verified ready managed-app receipt is available. The changes are preserved. No rendered pixels were reviewed; this does not establish completion, corrected defects, or requested quality. Other requested checks are not implied by this report.";

function freshFrontendReviewAttempt(
  actionResults: readonly ActionResult[],
  requirements: WorkspaceNoopRequirements,
  userRequest: string,
): ActionResult | undefined {
  if (!frontendReviewRequired(actionResults, userRequest)) return undefined;
  // A corrected frontend may also depend on a later backend/config edit or
  // rebuild. Never let an earlier review certify a newer application state.
  const latestApplicationChange = actionResults.reduce(
    (latest, result, index) => {
      const command = extractCommandResultFromActionResult(result);
      const changed = extractLocalMutationsFromActionResult(result).some(
        (mutation) => mutation.success,
      );
      const rebuilt =
        actionResultActionName(result) === "SHELL" &&
        command &&
        inspectWorkspaceCommands(command.command, command.executedIn).some(
          (operation) => operation.kind === "build",
        );
      return changed ||
        rebuilt ||
        actionResultActionName(result) === "DOOLITTLE_APP_SERVER"
        ? index
        : latest;
    },
    -1,
  );
  for (
    let index = actionResults.length - 1;
    index > latestApplicationChange;
    index -= 1
  ) {
    const review = actionResults[index];
    if (
      !review ||
      actionResultActionName(review) !== "DOOLITTLE_BROWSER_ANALYZE" ||
      chronologyUnverified(review) ||
      !isRecord(review.data) ||
      review.data.reviewAttempted !== true ||
      typeof review.data.reviewedUrl !== "string"
    )
      continue;
    const reviewedUrl = review.data.reviewedUrl;
    for (
      let readyIndex = index - 1;
      readyIndex >= latestApplicationChange;
      readyIndex -= 1
    ) {
      const ready = actionResults[readyIndex];
      if (
        ready?.success !== true ||
        chronologyUnverified(ready) ||
        actionResultActionName(ready) !== "DOOLITTLE_APP_SERVER" ||
        !isRecord(ready.data) ||
        ready.data.status !== "ready" ||
        ready.data.url !== reviewedUrl
      )
        continue;
      if (
        missingWorkspaceMutationRequirements(
          actionResults.slice(0, readyIndex + 1),
          frontendRequirements(actionResults, requirements, userRequest),
        ).length === 0
      )
        return review;
    }
  }
  return undefined;
}

export function unresolvedInteractiveTextBlocker(
  actionResults: readonly ActionResult[],
  requirements: WorkspaceNoopRequirements,
  userRequest: string,
): boolean {
  if (!frontendReviewRequired(actionResults, userRequest)) return false;
  const pending = new Map<
    string,
    { index: number; workspace: string | undefined }
  >();
  const subjectKey = (subject: {
    subjectSha256: string | null;
    viewport: { width: number; height: number };
  }) =>
    `${subject.viewport.width}x${subject.viewport.height}:${subject.subjectSha256}`;
  for (const [reviewIndex, review] of actionResults.entries()) {
    if (actionResultActionName(review) !== "DOOLITTLE_BROWSER_ANALYZE")
      continue;
    const prefix = actionResults.slice(0, reviewIndex + 1);
    const check = readInteractiveTextCheck(review.data?.interactiveTextCheck);
    if (
      !check ||
      freshFrontendReviewAttempt(prefix, requirements, userRequest) !== review
    )
      continue;
    const evidence = review.data?.evidence;
    if (!Array.isArray(evidence)) continue;
    const bound = (subject: {
      viewport: { width: number; height: number };
      pngSha256: string;
    }) =>
      evidence.some(
        (item) =>
          isRecord(item) &&
          item.captureMode === "rendered-page" &&
          item.captureReady === true &&
          isRecord(item.viewport) &&
          item.viewport.width === subject.viewport.width &&
          item.viewport.height === subject.viewport.height &&
          isRecord(item.pixels) &&
          item.pixels.sha256 === subject.pngSha256,
      );
    for (const blocker of check.blockers) {
      if (!bound(blocker)) continue;
      pending.set(
        blocker.subjectSha256
          ? subjectKey(blocker)
          : `unidentified:${reviewIndex}:${blocker.viewport.width}x${blocker.viewport.height}:${blocker.candidateIndex}`,
        {
          index: reviewIndex,
          workspace: admittedWorkspace(prefix, undefined),
        },
      );
    }
    if (check.blockersTruncated)
      pending.set(`truncated:${reviewIndex}`, {
        index: reviewIndex,
        workspace: undefined,
      });
    // Only per-subject qualified clearance can resolve. Aggregate unknown or
    // a different new blocker neither clears nor drops an earlier subject.
    if (
      review.success !== true ||
      review.data?.modelEvidence !== "rendered-pixels" ||
      evidence.length !== 2 ||
      !evidence.every(
        (item, index) =>
          isRecord(item) &&
          item.captureMode === "rendered-page" &&
          item.captureReady === true &&
          item.blockedRequests === 0 &&
          isRecord(item.viewport) &&
          item.viewport.width === (index === 0 ? 1280 : 390) &&
          item.viewport.height === (index === 0 ? 720 : 844),
      )
    )
      continue;
    for (const clearance of check.clearances) {
      const key = subjectKey(clearance);
      const prior = pending.get(key);
      if (!prior?.workspace || prior.index >= reviewIndex || !bound(clearance))
        continue;
      const correctionResults = actionResults.slice(
        prior.index + 1,
        reviewIndex + 1,
      );
      if (
        hasVerifiedWorkspaceMutation(correctionResults, prior.workspace) &&
        missingWorkspaceMutationRequirements(
          [
            ...actionResults
              .slice(0, prior.index + 1)
              .filter(
                (result) =>
                  actionResultActionName(result) === "TASKS_SPAWN_AGENT",
              ),
            ...correctionResults,
          ],
          {
            ...frontendRequirements(prefix, requirements, userRequest),
            requireBunInstall: false,
          },
        ).length === 0
      )
        pending.delete(key);
    }
  }
  return pending.size > 0;
}

export function frontendReviewAttempt(
  actionResults: readonly ActionResult[],
  requirements: WorkspaceNoopRequirements,
  userRequest: string,
): ActionResult | undefined {
  return unresolvedInteractiveTextBlocker(
    actionResults,
    requirements,
    userRequest,
  )
    ? undefined
    : freshFrontendReviewAttempt(actionResults, requirements, userRequest);
}

export const UNRESOLVED_INTERACTIVE_TEXT_FAILURE =
  "The frontend changes are preserved, but captured enabled interactive text had equal opaque foreground and solid background colors. Correction remains unresolved or unverified after the bounded continuation attempts. Completion is not established: scoped correction, production build, current managed readiness and a qualified fresh review are required. Unknown, text-only or failed review cannot clear this captured readability blocker. This is not a general accessibility or visual quality assessment.";

export function frontendReviewSummary(result: ActionResult): string {
  const modality = isRecord(result.data)
    ? result.data.modelEvidence
    : undefined;
  const resultText =
    result.success === true && modality === "rendered-pixels"
      ? "Browser analysis used rendered viewport pixels."
      : result.success === true && modality === "text-only"
        ? "Browser analysis used text-only evidence; rendered layout was not verified."
        : "Browser analysis was attempted but failed or was unavailable; rendered layout was not verified.";
  return `${interactiveTextSummary(readInteractiveTextCheck(result.data?.interactiveTextCheck))} ${resultText} This review attempt does not prove that reported defects were corrected or that the requested quality was achieved; consult the browser-analysis findings.`;
}
