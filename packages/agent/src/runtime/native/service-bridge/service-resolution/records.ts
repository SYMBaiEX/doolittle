import { SERVICE_RESOLUTION_DEFINITIONS } from "../../service-manifest";
import type { NativeServices } from "../runtime-contracts";
import type { EffectiveServiceResolutionRecord } from "./types";

export function buildEffectiveServiceResolutionRecords(
  native: NativeServices,
): EffectiveServiceResolutionRecord[] {
  return SERVICE_RESOLUTION_DEFINITIONS.map(
    ({ capability, nativeKey, nativeService, requirement }) => {
      const service = native[nativeKey];

      return {
        capability,
        nativeService,
        source: service ? ("native" as const) : ("unavailable" as const),
        ownership: "plugin" as const,
        requirement,
        available: Boolean(service),
      };
    },
  );
}
