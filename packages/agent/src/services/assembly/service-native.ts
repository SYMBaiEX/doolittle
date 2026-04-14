import { getNativePackageAudit } from "@/runtime/native/package-audit";
import { getNativePluginCatalog } from "@/runtime/native/plugin-catalog";
import type { EnvConfig } from "@/types";
import type { LazySlot } from "../lazy-slot";
import { createLazySlot } from "../lazy-slot";
import type { NativeServiceRegistry } from "../native-service-registry";
import { createNativeServiceRegistry } from "../native-service-registry";

type NativePackageAuditSnapshot = ReturnType<typeof getNativePackageAudit>;
type NativePluginCatalogEntry = ReturnType<
  typeof getNativePluginCatalog
>[number];

export interface ServiceNativeWiring {
  nativeRegistry: NativeServiceRegistry;
  nativePluginCatalog: LazySlot<ReadonlyArray<NativePluginCatalogEntry>>;
  nativePackageAudit: LazySlot<NativePackageAuditSnapshot>;
}

export function createServiceNativeWiring(
  config: EnvConfig,
): ServiceNativeWiring {
  return {
    nativeRegistry: createNativeServiceRegistry(),
    nativePluginCatalog: createLazySlot(() => getNativePluginCatalog(config)),
    nativePackageAudit: createLazySlot(() => getNativePackageAudit(config)),
  };
}
