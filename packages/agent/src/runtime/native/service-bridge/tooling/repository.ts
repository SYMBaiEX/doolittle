import type { RuntimeLike } from "../runtime-contracts";
import { requireNativeCodingAgent } from "./native-services";

export async function getNativeRepositoryStatus(runtime: RuntimeLike) {
  return await requireNativeCodingAgent(runtime).repoStatus();
}

export async function getNativeRepositoryDiff(runtime: RuntimeLike) {
  return await requireNativeCodingAgent(runtime).repoDiff();
}

export async function getNativeRepositoryLog(runtime: RuntimeLike, limit = 10) {
  return await requireNativeCodingAgent(runtime).repoLog(limit);
}
