import { loadConfig } from "@doolittle/agent/config/env";
import type { AppLogger } from "@doolittle/agent/logging/logger";
import { launchCliBackgroundJob } from "../cli/jobs/index";
import { ensureOnboarded, loadLocalRuntimeEnv } from "../cli/startup";
import { writeStderrLine } from "./output";
import type { OneShotOptions } from "./subcommand";

export async function handleBackgroundExec(input: {
  oneShot: OneShotOptions;
  prompt?: string;
  jobControlDir?: string;
  launcherPath?: string;
  entryLogger: AppLogger;
}): Promise<number> {
  const { oneShot, launcherPath, entryLogger, prompt } = input;
  if (!prompt?.trim()) {
    entryLogger.warn("exec-background-usage");
    writeStderrLine(
      'Usage: doolittle exec --prompt "your request" --background',
    );
    return 1;
  }
  if (oneShot.jsonStream) {
    entryLogger.warn("exec-background-json-stream-conflict");
    writeStderrLine("Cannot combine --background with --json-stream.");
    return 1;
  }

  await ensureOnboarded();
  loadLocalRuntimeEnv();
  const config = loadConfig();

  if (!launcherPath) {
    entryLogger.error("exec-background-missing-launcher");
    writeStderrLine("The launcher path is unavailable for background runs.");
    return 1;
  }

  const job = await launchCliBackgroundJob({
    config: { ...config, dataDir: input.jobControlDir || config.dataDir },
    launcherPath,
    prompt,
    sessionId: oneShot.sessionId,
  });
  if (oneShot.json) {
    console.log(JSON.stringify(job));
  } else {
    console.log(
      `Started background job ${job.id}. Use "doolittle jobs attach ${job.id}" to follow it live.`,
    );
  }
  return 0;
}
