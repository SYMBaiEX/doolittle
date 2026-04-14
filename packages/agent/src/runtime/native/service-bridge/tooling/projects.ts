import type { AppServices } from "@/services";
import {
  findLocalCodebases,
  inspectLocalProject,
  type LocalProjectInspection,
} from "@/services/project-inspection";
import type { RuntimeLike } from "../runtime-contracts";
import { getNativeCodingAgent } from "./native-services";

export async function inspectEffectiveProject(
  runtime: RuntimeLike,
  _services: AppServices,
  projectPath: string,
): Promise<LocalProjectInspection> {
  const nativeInspection =
    await getNativeCodingAgent(runtime)?.inspectProject?.(projectPath);
  if (nativeInspection) {
    return nativeInspection as LocalProjectInspection;
  }
  return inspectLocalProject(projectPath);
}

export async function findEffectiveLocalCodebases(
  _runtime: RuntimeLike,
  services: AppServices,
  query: string,
) {
  return findLocalCodebases(query, services.workspace.root());
}
