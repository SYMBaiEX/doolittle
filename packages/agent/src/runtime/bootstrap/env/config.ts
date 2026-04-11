import { loadConfig } from "@/config/env";
import { bootstrapRuntimeEnvironment } from "@/runtime/bootstrap/env/runtime";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import type { EnvConfig } from "@/types/runtime";

export function loadBootstrapConfig(): EnvConfig {
  appendBootstrapTrace("phase:loadConfig:start");
  const config = loadConfig();
  bootstrapRuntimeEnvironment(config);
  appendBootstrapTrace("phase:loadConfig:done");
  return config;
}
