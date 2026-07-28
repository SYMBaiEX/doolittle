import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime-contracts";
import { getNativeCodingAgent } from "./native-services";

export function readEffectiveWorkspaceFile(
  runtime: RuntimeLike,
  services: AppServices,
  path: string,
) {
  return (
    getNativeCodingAgent(runtime)?.read(path) ?? services.workspace.read(path)
  );
}

export async function searchEffectiveWorkspace(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
  limit = 20,
) {
  return await (getNativeCodingAgent(runtime)?.search(query, limit) ??
    services.workspace.search(query, limit));
}

export async function writeEffectiveWorkspaceFile(
  runtime: RuntimeLike,
  services: AppServices,
  path: string,
  content: string,
) {
  return await (getNativeCodingAgent(runtime)?.write(path, content) ??
    services.workspace.write(path, content));
}
