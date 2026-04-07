import type { IAgentRuntime } from "@elizaos/core";
import type { EnvConfig } from "@/types";
import type { DocumentsService } from "../documents-service";
import type { LazySlot } from "../lazy-slot";
import type { AppServices } from "../types";
import { createRuntimeBinder } from "./runtime-binding";
import { createServiceBootstrapState } from "./service-bootstrap";
import { createAppServiceGroups } from "./service-construction";
import { createServiceDirectoryLayout } from "./service-directories";
import { createServiceNativeWiring } from "./service-native";
import { defineSlotBackedProperties } from "./slot-properties";

export function createServices(
  config: EnvConfig,
  runtime?: ConstructorParameters<typeof DocumentsService>[0],
): AppServices {
  const bootstrap = createServiceBootstrapState(config);
  const directories = createServiceDirectoryLayout(config);
  const native = createServiceNativeWiring(config);
  const { eagerServices, lazyServices, runtimeBinding } =
    createAppServiceGroups(config, runtime, bootstrap, directories, native);
  const lazyServiceSlots = lazyServices as unknown as Record<
    string,
    LazySlot<unknown>
  >;
  const services = defineSlotBackedProperties(
    eagerServices as AppServices,
    lazyServiceSlots,
  ) as unknown as AppServices & {
    __bindRuntime?: (nextRuntime: IAgentRuntime) => void;
  };

  Object.defineProperty(services, "__bindRuntime", {
    enumerable: false,
    value: createRuntimeBinder({
      ...runtimeBinding,
      createDocumentsService: runtimeBinding.createDocumentsService,
    }),
  });

  return services;
}
