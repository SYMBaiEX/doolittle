import type { IAgentRuntime } from "@elizaos/core";
import type { EnvConfig } from "../../types/index";
import type { DocumentsService } from "../documents-service";
import type { AppServices } from "../types";
import { createRuntimeBinder } from "./runtime-binding";
import { createServiceBootstrapState } from "./service-bootstrap";
import { createAppServiceGroups } from "./service-construction";
import { createServiceDirectoryLayout } from "./service-directories";
import { createServiceNativeWiring } from "./service-native";
import { defineSlotBackedProperties } from "./slot-properties";

export interface AppServiceAssembly {
  readonly services: AppServices;
  bindRuntime(runtime: IAgentRuntime): void;
}

/** Compose one service graph; runtime attachment is an explicit owner operation. */
export function createServiceAssembly(
  config: EnvConfig,
  runtime?: ConstructorParameters<typeof DocumentsService>[0],
): AppServiceAssembly {
  const bootstrap = createServiceBootstrapState(config);
  const directories = createServiceDirectoryLayout(config);
  const native = createServiceNativeWiring(config);
  const { eagerServices, lazyServices, runtimeBinding } =
    createAppServiceGroups(config, runtime, bootstrap, directories, native);
  const services = defineSlotBackedProperties(
    eagerServices,
    lazyServices,
  ) satisfies AppServices;
  const bindRuntime = createRuntimeBinder(runtimeBinding);
  return { services, bindRuntime };
}

/** Standalone service construction; application owners retain the full assembly. */
export function createServices(
  config: EnvConfig,
  runtime?: ConstructorParameters<typeof DocumentsService>[0],
): AppServices {
  return createServiceAssembly(config, runtime).services;
}
