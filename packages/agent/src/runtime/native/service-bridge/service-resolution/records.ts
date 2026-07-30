import { SERVICE_RESOLUTION_DEFINITIONS } from "../../service-manifest";
import type { NativeServices } from "../runtime-contracts";
import type { EffectiveServiceResolutionRecord } from "./types";

export function buildEffectiveServiceResolutionRecords(
  native: NativeServices,
): EffectiveServiceResolutionRecord[] {
  return SERVICE_RESOLUTION_DEFINITIONS.map(
    ({ capability, nativeKey, nativeService, productServices, fallback }) => {
      const service = native[nativeKey];
      const hasProductFallback = productServices.length > 0;

      return {
        capability,
        nativeService,
        source: service
          ? ("native" as const)
          : hasProductFallback
            ? ("product" as const)
            : ("unavailable" as const),
        ownership: service || !hasProductFallback ? "plugin" : "product",
        fallback,
        available: Boolean(service),
      };
    },
  );
}
