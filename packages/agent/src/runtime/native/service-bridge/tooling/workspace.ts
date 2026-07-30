import type { RuntimeLike } from "../runtime-contracts";
import { requireNativeCodingAgent } from "./native-services";

export function getNativeWorkspaceRoot(runtime: RuntimeLike): string {
  return requireNativeCodingAgent(runtime).workspaceRoot();
}

export function getNativeWorkspaceSummary(
  runtime: RuntimeLike,
  limit = 40,
): string {
  return requireNativeCodingAgent(runtime).workspaceSummary(limit);
}

export function readNativeWorkspaceFile(runtime: RuntimeLike, path: string) {
  return requireNativeCodingAgent(runtime).read(path);
}

export async function searchNativeWorkspace(
  runtime: RuntimeLike,
  query: string,
  limit = 20,
) {
  return await requireNativeCodingAgent(runtime).search(query, limit);
}

export async function writeNativeWorkspaceFile(
  runtime: RuntimeLike,
  path: string,
  content: string,
) {
  return await requireNativeCodingAgent(runtime).write(path, content);
}
