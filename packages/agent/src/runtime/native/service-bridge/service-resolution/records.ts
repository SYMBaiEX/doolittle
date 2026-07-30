import { SERVICE_RESOLUTION_DEFINITIONS } from "../../service-manifest";
import type { NativeServices } from "../runtime-contracts";
import type { EffectiveServiceResolutionRecord } from "./types";

function resolveOwnership(nativeService: unknown): "plugin" | "product" {
  return nativeService ? "plugin" : "product";
}

export function buildEffectiveServiceResolutionRecords(
  native: NativeServices,
): EffectiveServiceResolutionRecord[] {
  return SERVICE_RESOLUTION_DEFINITIONS.map(
    ({ capability, nativeKey, nativeService, fallback }) => {
      const service = native[nativeKey];

      return {
        capability,
        nativeService,
        source: service ? "native" : "product",
        ownership: resolveOwnership(service),
        fallback,
        available: Boolean(service),
      };
    },
  );
}
