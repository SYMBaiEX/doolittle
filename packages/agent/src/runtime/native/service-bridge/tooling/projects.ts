import type { LocalProjectInspection } from "@/services/project-inspection";
import type { RuntimeLike } from "../runtime-contracts";
import { requireNativeCodingAgent } from "./native-services";

export async function inspectNativeProject(
  runtime: RuntimeLike,
  projectPath: string,
): Promise<LocalProjectInspection> {
  const service = requireNativeCodingAgent(runtime);
  if (typeof service.inspectProject !== "function") {
    throw new Error(
      "Required Eliza service coding_agent does not implement inspectProject().",
    );
  }
  return (await service.inspectProject(projectPath)) as LocalProjectInspection;
}

export async function findNativeLocalCodebases(
  runtime: RuntimeLike,
  query: string,
) {
  return requireNativeCodingAgent(runtime).findCodebases(query);
}
