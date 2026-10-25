import { loadConfig } from "../../../config/env/index";
import type { EnvConfig } from "../../../types/runtime/index";
import { appendBootstrapTrace } from "../trace";
import { bootstrapRuntimeEnvironment } from "./runtime";

export function loadBootstrapConfig(): EnvConfig {
  appendBootstrapTrace("phase:loadConfig:start");
  const config = loadConfig();
  bootstrapRuntimeEnvironment(config);
  appendBootstrapTrace("phase:loadConfig:done");
  return config;
}
