import type { IAgentRuntime, Plugin, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";

export interface ServiceAdapterSpec<T extends object> {
  serviceType: string;
  capabilityDescription: string;
  create: (runtime: IAgentRuntime) => Promise<T> | T;
  onStop?: (resource: T) => Promise<void> | void;
}

export function createServiceAdapter<T extends object>(
  spec: ServiceAdapterSpec<T>,
) {
  class AdaptedService extends ElizaService {
    static serviceType = spec.serviceType;
    capabilityDescription = spec.capabilityDescription;
    resource!: T;

    static async start(runtime: IAgentRuntime): Promise<Service> {
      const service = new AdaptedService(runtime);
      const resource = await spec.create(runtime);
      service.resource = resource;
      Object.assign(service, resource);
      return service as unknown as Service;
    }

    async stop(): Promise<void> {
      await spec.onStop?.(this.resource);
    }
  }

  return AdaptedService;
}

export function createServicePlugin(
  name: string,
  description: string,
  serviceClass: ReturnType<typeof createServiceAdapter>,
): Plugin {
  return {
    name,
    description,
    services: [serviceClass],
  };
}

export async function readJsonSetting<T>(
  runtime: Pick<IAgentRuntime, "getSetting">,
  key: string,
  fallback: T,
): Promise<T> {
  const raw = await runtime.getSetting(key);
  if (typeof raw !== "string") {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function stableHashVector(text: string, dimensions = 16): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (let index = 0; index < text.length; index += 1) {
    const slot = index % dimensions;
    vector[slot] = (vector[slot] + text.charCodeAt(index) * (index + 1)) % 9973;
  }
  return vector.map((value) => Number((value / 9973).toFixed(6)));
}
