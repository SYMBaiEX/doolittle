import type { RuntimeLike } from "../runtime-contracts";
import { requireNativeCodingAgent } from "./native-services";

export function getNativeWorkspaceRoot(runtime: RuntimeLike): string {
  return requireNativeCodingAgent(runtime).workspaceRoot();
}

export async function getNativeWorkspaceSummary(
  runtime: RuntimeLike,
  limit = 40,
): Promise<string> {
  return await requireNativeCodingAgent(runtime).workspaceSummary(limit);
}

export function readNativeWorkspaceFile(runtime: RuntimeLike, path: string) {
  return requireNativeCodingAgent(runtime).read(path);
}

export function readNativeWorkspaceFileLines(
  runtime: RuntimeLike,
  path: string,
  options: { offset?: number; limit?: number } = {},
) {
  return requireNativeCodingAgent(runtime).readLines(path, options);
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

export async function writeNativeWorkspaceFileResult(
  runtime: RuntimeLike,
  path: string,
  content: string,
) {
  return await requireNativeCodingAgent(runtime).writeFile(path, content);
}

export function createNativeWorkspaceDirectory(
  runtime: RuntimeLike,
  path: string,
) {
  return requireNativeCodingAgent(runtime).createDirectory(path);
}

export async function patchNativeWorkspaceFile(
  runtime: RuntimeLike,
  path: string,
  oldText: string,
  newText: string,
  options: { replaceAll?: boolean } = {},
) {
  return await requireNativeCodingAgent(runtime).patch(
    path,
    oldText,
    newText,
    options,
  );
}

export function searchNativeWorkspaceFiles(
  runtime: RuntimeLike,
  input: Parameters<
    ReturnType<typeof requireNativeCodingAgent>["searchFiles"]
  >[0],
) {
  return requireNativeCodingAgent(runtime).searchFiles(input);
}
