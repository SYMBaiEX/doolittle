import { launchCliBackgroundJob, summarizeCliJob } from "@/cli/jobs";
import { ensureOnboarded, loadLocalRuntimeEnv } from "@/cli/startup";
import { loadConfig } from "@/config/env";
import { printCliJobRecord, writeStderrLine } from "./output";
import type { EntrypointSubcommand, OneShotOptions } from "./subcommand";

interface BackgroundExecLogger {
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export async function handleBackgroundExec(options: {
  command: EntrypointSubcommand;
  oneShot?: OneShotOptions;
  immediatePrompt?: string;
  jobControlDir?: string;
  launcherPath?: string;
  sessionId?: string;
  entryLogger: BackgroundExecLogger;
  ensureOnboarded?: typeof ensureOnboarded;
  loadLocalRuntimeEnv?: typeof loadLocalRuntimeEnv;
  loadConfig?: typeof loadConfig;
  launchCliBackgroundJob?: typeof launchCliBackgroundJob;
  printCliJobRecord?: typeof printCliJobRecord;
  summarizeCliJob?: typeof summarizeCliJob;
  writeStderrLine?: typeof writeStderrLine;
  printLine?: (message: string) => void;
  exit?: (code: number) => void;
}): Promise<boolean> {
  const {
    command,
    oneShot,
    immediatePrompt,
    jobControlDir,
    launcherPath,
    sessionId,
    entryLogger,
  } = options;

  if (command !== "exec" || !oneShot?.background) {
    return false;
  }

  const ensureOnboardedFn = options.ensureOnboarded ?? ensureOnboarded;
  const loadLocalRuntimeEnvFn =
    options.loadLocalRuntimeEnv ?? loadLocalRuntimeEnv;
  const loadConfigFn = options.loadConfig ?? loadConfig;
  const launchCliBackgroundJobFn =
    options.launchCliBackgroundJob ?? launchCliBackgroundJob;
  const printCliJobRecordFn = options.printCliJobRecord ?? printCliJobRecord;
  const summarizeCliJobFn = options.summarizeCliJob ?? summarizeCliJob;
  const writeStderrLineFn = options.writeStderrLine ?? writeStderrLine;
  const printLineFn = options.printLine ?? console.log;
  const exitFn = options.exit ?? process.exit;

  if (!immediatePrompt?.trim()) {
    entryLogger.warn("exec-background-usage");
    writeStderrLineFn(
      'Usage: doolittle exec --prompt "your request" --background',
    );
    exitFn(1);
    return true;
  }
  if (oneShot.jsonStream) {
    entryLogger.warn("exec-background-json-stream-conflict");
    writeStderrLineFn("Cannot combine --background with --json-stream.");
    exitFn(1);
    return true;
  }

  await ensureOnboardedFn();
  loadLocalRuntimeEnvFn();
  const config = loadConfigFn();

  if (!launcherPath) {
    entryLogger.error("exec-background-missing-launcher");
    writeStderrLineFn("The launcher path is unavailable for background runs.");
    exitFn(1);
    return true;
  }

  const job = launchCliBackgroundJobFn({
    config: {
      ...config,
      dataDir: jobControlDir || config.dataDir,
    },
    launcherPath,
    prompt: immediatePrompt,
    sessionId,
  });

  if (oneShot.json) {
    printCliJobRecordFn(job, true, summarizeCliJobFn);
  } else {
    printLineFn(
      `Started background job ${job.id}. Use "doolittle jobs attach ${job.id}" to follow it live.`,
    );
  }

  return true;
}
