import type { DesktopExecutionAdmissionOptions } from "./execution-admission";

const FLEET_OPTIONS = {
  DOOLITTLE_ENGINE_MAX_EXECUTIONS: "maxConcurrent",
  DOOLITTLE_ENGINE_MAX_AUTOMATIC_ACP: "maxAutomaticAcp",
  DOOLITTLE_ENGINE_MAX_EXECUTIONS_PER_BOT: "maxPerBotActive",
  DOOLITTLE_ENGINE_MAX_PENDING: "maxPending",
  DOOLITTLE_ENGINE_MAX_PENDING_PER_BOT: "maxPendingPerBot",
  DOOLITTLE_ENGINE_QUEUE_TIMEOUT_MS: "queueTimeoutMs",
} as const;

/** Operator-owned capacity only; renderer and worker payloads cannot raise limits. */
export function readExecutionCapacity(
  environment: NodeJS.ProcessEnv = process.env,
): DesktopExecutionAdmissionOptions {
  const options: DesktopExecutionAdmissionOptions = {};
  for (const [key, option] of Object.entries(FLEET_OPTIONS)) {
    const value = environment[key];
    if (value === undefined) continue;
    if (!/^[1-9][0-9]{0,8}$/u.test(value)) {
      throw new Error(`Invalid fleet capacity setting: ${key}.`);
    }
    options[option] = Number(value);
  }
  // The admission constructor checks range and cross-limit relationships.
  return options;
}
