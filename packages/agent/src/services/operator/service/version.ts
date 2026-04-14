import type { EnvConfig } from "@/types";
import {
  buildOperatorVersionSummary,
  loadOperatorPackageMetadata,
  type OperatorVersionSummary,
} from "../version";

export interface OperatorVersionAccess {
  read(config: EnvConfig): OperatorVersionSummary;
}

export function createOperatorVersionAccess(
  packageMetadata = loadOperatorPackageMetadata(),
): OperatorVersionAccess {
  return {
    read(config: EnvConfig): OperatorVersionSummary {
      return buildOperatorVersionSummary(config, packageMetadata);
    },
  };
}
