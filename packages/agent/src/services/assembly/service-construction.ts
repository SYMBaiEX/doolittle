import type { EnvConfig } from "@/types";
import type { DocumentsService } from "../documents-service";
import { createServiceAssemblyResult } from "./construction/groups";
import { createServiceConstructionState } from "./construction/state";
import type { ServiceAssemblyResult } from "./construction/types";
import type {
  RuntimeModelContextResolver,
  ServiceBootstrapState,
} from "./service-bootstrap";
import type { ServiceDirectoryLayout } from "./service-directories";
import type { ServiceNativeWiring } from "./service-native";

export type {
  ServiceAssemblyResult,
  ServiceRuntimeBindingDependencies,
} from "./construction/types";

export function createAppServiceGroups(
  config: EnvConfig,
  runtime: ConstructorParameters<typeof DocumentsService>[0] | undefined,
  bootstrap: ServiceBootstrapState & {
    resolveModelContext: RuntimeModelContextResolver;
  },
  directories: ServiceDirectoryLayout,
  native: ServiceNativeWiring,
): ServiceAssemblyResult {
  const state = createServiceConstructionState(
    config,
    runtime,
    bootstrap,
    directories,
    native,
  );

  return createServiceAssemblyResult(state);
}
