import type { AgentRuntime } from "@elizaos/core";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import { createMemoryStorageRuntimeService } from "@/runtime/native/memory-storage-runtime";
import type { AppServices } from "@/services";

type RuntimeServiceRegistrationState = {
  services?: Map<string, unknown[]>;
  serviceRegistrationStatus?: Map<string, string>;
  servicePromiseHandlers?: Map<
    string,
    {
      resolve: (service: unknown) => void;
      reject: (error: unknown) => void;
    }
  >;
};

function getRuntimeServiceState(
  runtime: AgentRuntime,
): RuntimeServiceRegistrationState {
  return runtime as unknown as RuntimeServiceRegistrationState;
}

export async function registerMemoryStorage(
  currentRuntime: AgentRuntime,
  services: AppServices,
): Promise<void> {
  const memoryStorageService = createMemoryStorageRuntimeService(
    services.sessions,
  );
  const runtimeWithInternals = getRuntimeServiceState(currentRuntime);
  const serviceType = String(memoryStorageService.serviceType);
  if (currentRuntime.getService(serviceType)) {
    appendBootstrapTrace("phase:memoryStorage:register:skip");
    return;
  }

  appendBootstrapTrace("phase:memoryStorage:register:start");
  await currentRuntime.registerService(memoryStorageService);
  const startedService = await memoryStorageService.start(currentRuntime);
  const servicesMap =
    runtimeWithInternals.services ?? currentRuntime.getAllServices();
  const existing = servicesMap.get(serviceType) ?? [];
  if (!existing.includes(startedService)) {
    servicesMap.set(serviceType, [...existing, startedService]);
  }

  runtimeWithInternals.serviceRegistrationStatus?.set(
    serviceType,
    "registered",
  );
  runtimeWithInternals.servicePromiseHandlers
    ?.get(serviceType)
    ?.resolve(startedService);
  appendBootstrapTrace("phase:memoryStorage:register:done");
}
