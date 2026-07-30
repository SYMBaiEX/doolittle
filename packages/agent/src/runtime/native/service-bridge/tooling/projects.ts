import type {
  LocalProjectInspection,
  LocalProjectTarget,
} from "@/services/project-inspection";
import type { RuntimeLike } from "../runtime-contracts";
import { requireNativeCodingAgent } from "./native-services";

export async function inspectNativeProject(
  runtime: RuntimeLike,
  projectPath?: string,
): Promise<LocalProjectInspection> {
  const service = requireNativeCodingAgent(runtime);
  return (await service.inspectProject(projectPath)) as LocalProjectInspection;
}

export async function findNativeLocalCodebases(
  runtime: RuntimeLike,
  query: string,
) {
  return requireNativeCodingAgent(runtime).findCodebases(query);
}

export function resolveNativeProjectTarget(
  runtime: RuntimeLike,
  inputPath: string,
): LocalProjectTarget | undefined {
  return requireNativeCodingAgent(runtime).resolveProjectTarget(inputPath);
}
