import type { IAgentRuntime } from "@elizaos/core";

export function requireRuntimeService<TService extends object>(
  runtime: IAgentRuntime,
  serviceType: string,
  requiredMethods: readonly (keyof TService)[] = [],
): TService {
  const service = runtime.getService(serviceType);
  if (!service || typeof service !== "object") {
    throw new Error(`Required Eliza service ${serviceType} is unavailable.`);
  }

  const record = service as unknown as Record<PropertyKey, unknown>;
  for (const method of requiredMethods) {
    if (typeof record[method] !== "function") {
      throw new Error(
        `Required Eliza service ${serviceType} does not implement ${String(method)}().`,
      );
    }
  }

  return service as TService;
}
