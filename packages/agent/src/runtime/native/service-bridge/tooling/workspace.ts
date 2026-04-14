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

export function searchEffectiveWorkspace(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
  limit = 20,
) {
  return (
    getNativeCodingAgent(runtime)?.search(query, limit) ??
    services.workspace.search(query, limit)
  );
}

export function writeEffectiveWorkspaceFile(
  runtime: RuntimeLike,
  services: AppServices,
  path: string,
  content: string,
) {
  return (
    getNativeCodingAgent(runtime)?.write(path, content) ??
    services.workspace.write(path, content)
  );
}
