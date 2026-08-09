#!/usr/bin/env nub

import { readFileSync } from "node:fs";
import { listGitTrackedFiles } from "./git-tracked-files";

const WORKFLOW_PATH = /^\.github\/workflows\/.+\.ya?ml$/u;
const ACTION_SHA =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$/iu;
const DOCKER_DIGEST = /^docker:\/\/.+@sha256:[0-9a-f]{64}$/iu;
const USES_REFERENCE =
  /^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/u;
const NUB_SETUP_REFERENCE = /^nubjs\/setup-nub@/u;
const NUB_VERSION_REFERENCE =
  /^\s*nub-version:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/u;

export interface MutableWorkflowAction {
  file: string;
  line: number;
  reference: string;
}

export interface WorkflowNubVersionMismatch {
  file: string;
  line: number;
  expected: string;
  actual: string;
}

export function isImmutableWorkflowAction(reference: string): boolean {
  return (
    reference.startsWith("./") ||
    ACTION_SHA.test(reference) ||
    DOCKER_DIGEST.test(reference)
  );
}

export function findMutableWorkflowActions(
  source: string,
  file: string,
): MutableWorkflowAction[] {
  const failures: MutableWorkflowAction[] = [];
  for (const [index, line] of source.split("\n").entries()) {
    const match = line.match(USES_REFERENCE);
    const reference = match?.[1] ?? match?.[2] ?? match?.[3];
    if (reference && !isImmutableWorkflowAction(reference)) {
      failures.push({ file, line: index + 1, reference });
    }
  }
  return failures;
}

export function findMismatchedWorkflowNubVersions(
  source: string,
  file: string,
  expected: string,
): WorkflowNubVersionMismatch[] {
  const lines = source.split("\n");
  const failures: WorkflowNubVersionMismatch[] = [];
  for (const [index, line] of lines.entries()) {
    const actionMatch = line.match(USES_REFERENCE);
    const action =
      actionMatch?.[1] ?? actionMatch?.[2] ?? actionMatch?.[3] ?? "";
    if (!NUB_SETUP_REFERENCE.test(action)) continue;

    const actionIndent = line.match(/^\s*/u)?.[0].length ?? 0;
    let actual: string | undefined;
    let actualLine = index + 1;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor] ?? "";
      const candidateIndent = candidate.match(/^\s*/u)?.[0].length ?? 0;
      if (
        candidate.trim() &&
        (candidateIndent < actionIndent ||
          (candidateIndent <= actionIndent && /^\s*-\s/u.test(candidate)))
      ) {
        break;
      }
      const versionMatch = candidate.match(NUB_VERSION_REFERENCE);
      if (!versionMatch) continue;
      actual = versionMatch[1] ?? versionMatch[2] ?? versionMatch[3];
      actualLine = cursor + 1;
      break;
    }
    if (actual !== expected) {
      failures.push({
        file,
        line: actualLine,
        expected,
        actual: actual ?? "<missing>",
      });
    }
  }
  return failures;
}

export function checkTrackedWorkflowActions(
  cwd = process.cwd(),
): MutableWorkflowAction[] {
  return listGitTrackedFiles(cwd)
    .filter((file) => WORKFLOW_PATH.test(file))
    .flatMap((file) =>
      findMutableWorkflowActions(readFileSync(`${cwd}/${file}`, "utf8"), file),
    );
}

export function checkTrackedWorkflowNubVersions(
  expected: string,
  cwd = process.cwd(),
): WorkflowNubVersionMismatch[] {
  return listGitTrackedFiles(cwd)
    .filter((file) => WORKFLOW_PATH.test(file))
    .flatMap((file) =>
      findMismatchedWorkflowNubVersions(
        readFileSync(`${cwd}/${file}`, "utf8"),
        file,
        expected,
      ),
    );
}

function expectedNubVersion(cwd = process.cwd()): string {
  const manifest = JSON.parse(readFileSync(`${cwd}/package.json`, "utf8")) as {
    packageManager?: unknown;
  };
  const match =
    typeof manifest.packageManager === "string"
      ? manifest.packageManager.match(/^nub@(.+)$/u)
      : null;
  if (!match?.[1]) {
    throw new Error("package.json must pin packageManager to nub@<version>.");
  }
  return match[1];
}

export function main(): void {
  const failures = checkTrackedWorkflowActions();
  const nubVersionFailures = checkTrackedWorkflowNubVersions(
    expectedNubVersion(),
  );
  if (failures.length > 0 || nubVersionFailures.length > 0) {
    console.error("Workflow policy check failed:");
    for (const failure of failures) {
      console.error(
        `- ${failure.file}:${failure.line} uses mutable reference ${failure.reference}`,
      );
    }
    for (const failure of nubVersionFailures) {
      console.error(
        `- ${failure.file}:${failure.line} configures Nub ${failure.actual}; expected ${failure.expected}`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log("Workflow action security and Nub alignment check passed.");
}

if (import.meta.main) {
  main();
}
