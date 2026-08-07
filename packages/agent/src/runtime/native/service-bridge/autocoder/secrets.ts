import type { NativeSecretsService } from "../runtime-contracts";
import { type RuntimeLike, resolveMethod } from "./resolve";

type Svc = NativeSecretsService;
const KEY = "secrets";

export async function getEffectiveSecret(runtime: RuntimeLike, key: string) {
  return resolveMethod<Svc, "getGlobal">(
    runtime,
    KEY,
    "getGlobal",
    "Eliza secrets service",
  )(key);
}

export async function setEffectiveSecret(
  runtime: RuntimeLike,
  key: string,
  value: string,
) {
  return resolveMethod<Svc, "setGlobal">(
    runtime,
    KEY,
    "setGlobal",
    "Eliza secrets service",
  )(key, value);
}

export async function hasEffectiveSecret(runtime: RuntimeLike, key: string) {
  return (await getEffectiveSecret(runtime, key)) !== null;
}

export async function listEffectiveSecretKeys(
  runtime: RuntimeLike,
): Promise<string[]> {
  if (!runtime.agentId) {
    throw new Error(
      "Native Eliza secrets service requires a runtime agent ID.",
    );
  }
  const metadata = await resolveMethod<Svc, "list">(
    runtime,
    KEY,
    "list",
    "Eliza secrets service",
  )({ level: "global", agentId: runtime.agentId });
  return Object.keys(metadata).sort();
}
