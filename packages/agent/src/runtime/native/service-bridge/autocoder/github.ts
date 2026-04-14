import type { NativeGitHubService } from "../runtime-contracts";
import { type RuntimeLike, resolveMethod } from "./resolve";

type Svc = NativeGitHubService;
const KEY = "github";

export async function createEffectiveRepository(
  runtime: RuntimeLike,
  name: string,
  isPrivate = true,
) {
  return resolveMethod<Svc, "createRepository">(
    runtime,
    KEY,
    "createRepository",
    "GitHub service",
  )(name, isPrivate);
}

export async function deleteEffectiveRepository(
  runtime: RuntimeLike,
  name: string,
) {
  return resolveMethod<Svc, "deleteRepository">(
    runtime,
    KEY,
    "deleteRepository",
    "GitHub service",
  )(name);
}
