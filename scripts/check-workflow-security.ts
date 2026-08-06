#!/usr/bin/env nub

import { readFileSync } from "node:fs";
import { listGitTrackedFiles } from "./git-tracked-files";

const WORKFLOW_PATH = /^\.github\/workflows\/.+\.ya?ml$/u;
const ACTION_SHA =
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$/iu;
const DOCKER_DIGEST = /^docker:\/\/.+@sha256:[0-9a-f]{64}$/iu;
const USES_REFERENCE =
  /^\s*(?:-\s*)?uses:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/u;

export interface MutableWorkflowAction {
  file: string;
  line: number;
  reference: string;
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

export function checkTrackedWorkflowActions(
  cwd = process.cwd(),
): MutableWorkflowAction[] {
  return listGitTrackedFiles(cwd)
    .filter((file) => WORKFLOW_PATH.test(file))
    .flatMap((file) =>
      findMutableWorkflowActions(readFileSync(`${cwd}/${file}`, "utf8"), file),
    );
}

export function main(): void {
  const failures = checkTrackedWorkflowActions();
  if (failures.length > 0) {
    console.error("Workflow action security check failed:");
    for (const failure of failures) {
      console.error(
        `- ${failure.file}:${failure.line} uses mutable reference ${failure.reference}`,
      );
    }
    process.exitCode = 1;
    return;
  }
  console.log("Workflow action security check passed.");
}

if (import.meta.main) {
  main();
}
