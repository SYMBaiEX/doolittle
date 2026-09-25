import { isAbsolute, relative, resolve, sep } from "node:path";
import type { CodingEvalCase } from "./cases";

export { CODING_EVAL_CASES } from "./cases";

export type CodingEvalStatus = "pass" | "fail" | "unknown" | "n/a";

export interface CodingEvalCheck {
  id:
    | "workspace"
    | "implementation"
    | "bun-install"
    | "build"
    | "runtime-smoke"
    | "app-ready"
    | "acceptance";
  status: CodingEvalStatus;
  weight: number;
  evidence: string[];
}

export interface CodingRunEvaluation {
  runId: string;
  caseId: string;
  status: "pass" | "fail" | "incomplete";
  score: number;
  maxScore: number;
  checks: CodingEvalCheck[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pathIsWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRoot))
  );
}

function resolveEvidencePath(
  path: string,
  workdir?: string,
  root?: string,
): string {
  if (isAbsolute(path)) return resolve(path);
  return resolve(workdir ?? root ?? process.cwd(), path);
}

function isGeneratedArtifact(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return (
    /(^|\/)(?:node_modules|\.next|\.turbo|\.git|\.cache|dist|build|coverage)\//u.test(
      normalized,
    ) || /(?:\.tsbuildinfo|\.sqlite(?:-(?:wal|shm))?|\.log)$/u.test(normalized)
  );
}

function isImplementationFile(path: string): boolean {
  if (isGeneratedArtifact(path)) return false;
  const normalized = path.replaceAll("\\", "/");
  return (
    /(^|\/)(?:src|app|pages|components|styles|public)\//u.test(normalized) ||
    /\.(?:[cm]?[jt]sx?|css|scss|less|html?|md|mdx|json)$/iu.test(normalized) ||
    /(^|\/)(?:package\.json|bun\.lock|next\.config\.[cm]?js|tsconfig(?:\.[^/]*)?\.json)$/u.test(
      normalized,
    )
  );
}

interface MutationEvidence {
  path: string;
  workdir?: string;
  source: string;
}

function mutationEvidence(
  run: UnknownRecord,
  events: unknown[],
  root: string,
): MutationEvidence[] {
  const evidence: MutationEvidence[] = [];
  for (const value of array(run.localMutations)) {
    const mutation = record(value);
    const path =
      string(mutation?.resolvedPath) ?? string(mutation?.requestedPath);
    if (path) evidence.push({ path, source: "run mutation receipt" });
  }

  for (const eventValue of events) {
    const metadata = record(record(eventValue)?.metadata);
    if (!metadata) continue;
    const actionResult = record(metadata.actionResult);
    const actionData = record(actionResult?.data);
    const delegated = record(actionData?.delegatedExecution);
    const workdir = string(delegated?.workdir);
    if (
      delegated?.status === "completed" &&
      delegated.verifiedLocalMutation === true
    ) {
      for (const changedFileValue of array(delegated.changedFiles)) {
        const changedFile = record(changedFileValue);
        const path = string(changedFile?.path);
        if (path) {
          evidence.push({
            path,
            workdir,
            source: "verified delegated file receipt",
          });
        }
      }
    }

    const mutation = record(metadata.mutation);
    const path =
      string(mutation?.resolvedPath) ?? string(mutation?.requestedPath);
    if (path) {
      evidence.push({ path, source: "action mutation receipt" });
    }
  }

  const unique = new Map<string, MutationEvidence>();
  for (const item of evidence) {
    const resolved = resolveEvidencePath(item.path, item.workdir, root);
    if (!unique.has(resolved))
      unique.set(resolved, { ...item, path: resolved });
  }
  return [...unique.values()];
}

interface BuildEvidence {
  command: string;
  workingDirectory?: string;
  workspaceVerified: boolean;
  exitCode: number;
  success: boolean;
}

function shellWorkingDirectory(
  commandResult: UnknownRecord,
  command: string,
  metadata: UnknownRecord,
): string | undefined {
  for (const candidate of [
    commandResult.cwd,
    commandResult.workingDirectory,
    metadata.cwd,
    metadata.workingDirectory,
    metadata.workdir,
  ]) {
    const path = string(candidate);
    if (path && isAbsolute(path)) return resolve(path);
  }

  // Shell receipts currently record the full command but not cwd. Accept only
  // an explicit leading `cd /absolute/path && ...` as historical cwd evidence.
  const directoryChange =
    /^\s*cd(?:\s+--)?\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))\s*(?:&&|;|\n)/u.exec(
      command,
    );
  const path =
    directoryChange?.[1] ?? directoryChange?.[2] ?? directoryChange?.[3];
  return path && isAbsolute(path) ? resolve(path) : undefined;
}

function buildEvidence(
  events: unknown[],
  expectedWorkspace: string,
): BuildEvidence[] {
  const results: BuildEvidence[] = [];
  for (const eventValue of events) {
    const metadata = record(record(eventValue)?.metadata);
    if (!metadata) continue;
    const action = string(metadata.action)?.toUpperCase();
    if (
      !action ||
      !["SHELL", "SHELL_COMMAND", "RUN_IN_TERMINAL"].includes(action)
    ) {
      continue;
    }
    const actionResult = record(metadata.actionResult);
    const actionData = record(actionResult?.data);
    const commandResult =
      record(metadata.commandResult) ?? record(actionData?.commandResult);
    const command = string(commandResult?.command);
    const exitCode = commandResult?.exitCode;
    if (
      !command ||
      typeof exitCode !== "number" ||
      !/(?:\b(?:bun|npm|pnpm|yarn)\s+(?:run\s+)?build\b|\bnext\s+build\b)/iu.test(
        command,
      )
    ) {
      continue;
    }
    const workingDirectory = shellWorkingDirectory(
      commandResult ?? {},
      command,
      metadata,
    );
    results.push({
      command,
      workingDirectory,
      workspaceVerified:
        workingDirectory !== undefined &&
        pathIsWithin(resolve(expectedWorkspace), workingDirectory),
      exitCode,
      success: exitCode === 0,
    });
  }
  return results;
}

function bunInstallEvidence(
  events: unknown[],
  expectedWorkspace: string,
): string[] {
  const evidence: string[] = [];
  for (const eventValue of events) {
    const metadata = record(record(eventValue)?.metadata);
    if (!metadata) continue;
    const action = string(metadata.action)?.toUpperCase();
    if (
      !action ||
      !["SHELL", "SHELL_COMMAND", "RUN_IN_TERMINAL"].includes(action)
    ) {
      continue;
    }
    const actionResult = record(metadata.actionResult);
    const actionData = record(actionResult?.data);
    const commandResult =
      record(metadata.commandResult) ?? record(actionData?.commandResult);
    const command = string(commandResult?.command);
    const exitCode = commandResult?.exitCode;
    if (
      !command ||
      exitCode !== 0 ||
      !/\bbun\s+(?:install|i)\b/u.test(command)
    ) {
      continue;
    }
    const workingDirectory = shellWorkingDirectory(
      commandResult ?? {},
      command,
      metadata,
    );
    if (
      workingDirectory &&
      pathIsWithin(resolve(expectedWorkspace), workingDirectory)
    ) {
      evidence.push(
        `Parent shell completed Bun install in ${workingDirectory}: ${command}.`,
      );
    }
  }
  return evidence;
}

function runtimeSmokeEvidence(
  events: unknown[],
  expectedWorkspace: string,
): string[] {
  const evidence: string[] = [];
  for (const eventValue of events) {
    const metadata = record(record(eventValue)?.metadata);
    if (!metadata || string(metadata.action)?.toUpperCase() !== "SHELL")
      continue;
    const actionResult = record(metadata.actionResult);
    const actionData = record(actionResult?.data);
    const commandResult =
      record(metadata.commandResult) ?? record(actionData?.commandResult);
    const command = string(commandResult?.command);
    const stdout = string(commandResult?.stdout);
    const workingDirectory = command
      ? shellWorkingDirectory(commandResult ?? {}, command, metadata)
      : undefined;
    if (
      !command ||
      !stdout ||
      commandResult?.exitCode !== 0 ||
      !workingDirectory ||
      !pathIsWithin(resolve(expectedWorkspace), workingDirectory) ||
      !/\bcurl\b/iu.test(command) ||
      !/(?:\/api\/|localhost|127\.0\.0\.1)/iu.test(command) ||
      !/(?:--fail|(?:^|\s)-[a-zA-Z]*f[a-zA-Z]*)/u.test(command)
    ) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(stdout.trim());
      if (record(parsed))
        evidence.push(`HTTP smoke returned JSON from ${command}.`);
    } catch {
      // A successful shell exit is insufficient if the endpoint returned HTML or non-JSON output.
    }
  }
  return evidence;
}

function managedAppReadyEvidence(events: unknown[], root: string): string[] {
  const evidence: string[] = [];
  for (const eventValue of events) {
    const metadata = record(record(eventValue)?.metadata);
    const actionResult = record(metadata?.actionResult);
    const actionData = record(actionResult?.data);
    const action = string(
      metadata?.action ?? actionData?.actionName,
    )?.toUpperCase();
    if (action !== "DOOLITTLE_APP_SERVER") continue;
    const status = string(actionData?.status);
    const url = string(actionData?.url);
    const session = record(actionData?.session);
    const cwd = string(session?.cwd);
    if (status !== "ready" || !url || !cwd) continue;
    let validUrl = false;
    try {
      const parsed = new URL(url);
      validUrl = parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      validUrl = false;
    }
    if (validUrl && pathIsWithin(root, resolve(cwd))) {
      evidence.push(`ready at ${url} in ${resolve(cwd)}`);
    }
  }
  return evidence;
}

function check(
  id: CodingEvalCheck["id"],
  status: CodingEvalStatus,
  weight: number,
  evidence: string[],
): CodingEvalCheck {
  return { id, status, weight, evidence };
}

export function evaluateCodingRun(input: {
  run: UnknownRecord;
  events: unknown[];
  expectedWorkspace: string;
  evalCase: CodingEvalCase;
}): CodingRunEvaluation {
  const run = input.run;
  const runId = string(run.runId) ?? "unknown-run";
  const root = resolve(input.expectedWorkspace);
  const changes = mutationEvidence(run, input.events, root);
  const resolvedChanges = changes.map((entry) => ({
    ...entry,
    resolvedPath: resolveEvidencePath(entry.path, entry.workdir, root),
  }));
  const outOfScope = resolvedChanges.filter(
    (entry) => !pathIsWithin(root, entry.resolvedPath),
  );
  const implementationChanges = resolvedChanges.filter((entry) =>
    isImplementationFile(entry.resolvedPath),
  );
  const isTerminal = ["complete", "error", "cancelled"].includes(
    String(run.status),
  );

  const workspaceCheck = !input.evalCase.requiresMutation
    ? check("workspace", "n/a", 0, ["This case does not require file changes."])
    : outOfScope.length > 0
      ? check("workspace", "fail", 20, [
          `Expected all changed paths under ${root}.`,
          ...outOfScope.map((entry) => entry.resolvedPath),
        ])
      : resolvedChanges.length > 0
        ? check("workspace", "pass", 20, [
            `${resolvedChanges.length} unique changed path(s) are scoped to ${root}.`,
          ])
        : check("workspace", isTerminal ? "fail" : "unknown", 20, [
            "No verified changed-file receipt was observed.",
          ]);

  const implementationCheck = !input.evalCase.requiresMutation
    ? check("implementation", "n/a", 0, [
        "This case does not require file changes.",
      ])
    : implementationChanges.length > 0
      ? check("implementation", "pass", 20, [
          `${implementationChanges.length} implementation/configuration file(s) changed.`,
        ])
      : check("implementation", isTerminal ? "fail" : "unknown", 20, [
          resolvedChanges.length > 0
            ? "Only generated/runtime artifacts were recorded; no implementation file change was verified."
            : "No implementation file change was verified.",
        ]);

  const builds = buildEvidence(input.events, root);
  const passingBuild = builds.find(
    (entry) => entry.success && entry.exitCode === 0 && entry.workspaceVerified,
  );
  const buildCheck = !input.evalCase.requiresBuild
    ? check("build", "n/a", 0, [
        "This case does not require a production build.",
      ])
    : passingBuild
      ? check("build", "pass", 30, [
          `Parent shell verified a production build: ${passingBuild.command} (exit ${passingBuild.exitCode}).`,
          ...(builds.some((entry) => !entry.success)
            ? [
                `Recovered after ${builds.filter((entry) => !entry.success).length} failed build attempt(s).`,
              ]
            : []),
        ])
      : check("build", isTerminal ? "fail" : "unknown", 30, [
          builds.length > 0
            ? `No successful production-build receipt was recorded from ${root}: ${builds.map((entry) => `${entry.command} (exit ${entry.exitCode}${entry.workingDirectory ? `, cwd ${entry.workingDirectory}` : ", cwd unverified"})`).join("; ")}.`
            : "No parent-shell production-build receipt was observed; a delegated agent's prose claim is not build evidence.",
        ]);

  const bunInstalls = bunInstallEvidence(input.events, root);
  const bunInstallCheck = !input.evalCase.requiresBunInstall
    ? check("bun-install", "n/a", 0, [
        "This case does not require a Bun dependency-install receipt.",
      ])
    : bunInstalls.length > 0
      ? check("bun-install", "pass", 10, bunInstalls)
      : check("bun-install", isTerminal ? "fail" : "unknown", 10, [
          `No successful parent-shell Bun install receipt was observed in ${root}.`,
        ]);

  const appReady = managedAppReadyEvidence(input.events, root);
  const appReadyCheck = !input.evalCase.requiresAppReady
    ? check("app-ready", "n/a", 0, [
        "This case does not require a running application.",
      ])
    : appReady.length > 0
      ? check("app-ready", "pass", 20, appReady)
      : check("app-ready", isTerminal ? "fail" : "unknown", 20, [
          "No ready managed-app receipt with a verified URL in the expected workspace was observed.",
        ]);

  const smokeEvidence = runtimeSmokeEvidence(input.events, root);
  const runtimeSmokeCheck = !input.evalCase.requiresRuntimeSmoke
    ? check("runtime-smoke", "n/a", 0, [
        "This case does not require an HTTP endpoint smoke test.",
      ])
    : smokeEvidence.length > 0
      ? check("runtime-smoke", "pass", 20, smokeEvidence)
      : check("runtime-smoke", isTerminal ? "fail" : "unknown", 20, [
          "No successful parent-shell curl receipt with fail-on-HTTP-error and JSON response was observed for a local API endpoint.",
        ]);

  const requiredChecks = [
    workspaceCheck,
    implementationCheck,
    bunInstallCheck,
    buildCheck,
    runtimeSmokeCheck,
    appReadyCheck,
  ].filter((entry) => entry.status !== "n/a");
  const blockers = requiredChecks.filter((entry) => entry.status === "fail");
  const unknowns = requiredChecks.filter((entry) => entry.status === "unknown");
  const acceptanceCheck =
    run.status === "complete"
      ? blockers.length === 0 && unknowns.length === 0
        ? check("acceptance", "pass", 10, [
            "The run is terminal-complete and every required acceptance check passed.",
          ])
        : check("acceptance", "fail", 10, [
            "The run is terminal-complete but required task acceptance evidence is missing or failing. The receipt does not expose the final chat wording, so response honesty needs human review.",
            ...blockers.map((entry) => `${entry.id}: ${entry.evidence[0]}`),
            ...unknowns.map((entry) => `${entry.id}: ${entry.evidence[0]}`),
          ])
      : isTerminal
        ? check("acceptance", "fail", 10, [
            `The run ended with status ${String(run.status)} before satisfying the requested acceptance checks. The receipt does not expose the final chat wording, so response honesty needs human review.`,
          ])
        : check("acceptance", "unknown", 10, [
            `Run is still ${String(run.status)}; acceptance cannot be finalized yet.`,
          ]);

  const checks = [
    workspaceCheck,
    implementationCheck,
    bunInstallCheck,
    buildCheck,
    runtimeSmokeCheck,
    appReadyCheck,
    acceptanceCheck,
  ];
  const scored = checks.filter((entry) => entry.status !== "n/a");
  const maxScore = scored.reduce((sum, entry) => sum + entry.weight, 0);
  const score = scored.reduce(
    (sum, entry) => sum + (entry.status === "pass" ? entry.weight : 0),
    0,
  );
  const status =
    blockers.length > 0 || acceptanceCheck.status === "fail"
      ? "fail"
      : unknowns.length > 0 || acceptanceCheck.status === "unknown"
        ? "incomplete"
        : "pass";

  return {
    runId,
    caseId: input.evalCase.id,
    status,
    score,
    maxScore,
    checks,
  };
}
