import type { NativeSecretsManagerService } from "../runtime-contracts";
import { type RuntimeLike, resolveMethod } from "./resolve";

type Svc = NativeSecretsManagerService;
const KEY = "secretsManager";

export async function getEffectiveSecret(runtime: RuntimeLike, key: string) {
  return resolveMethod<Svc, "getSecret">(
    runtime,
    KEY,
    "getSecret",
    "secrets service",
  )(key);
}

export async function setEffectiveSecret(
  runtime: RuntimeLike,
  key: string,
  value: string,
) {
  return resolveMethod<Svc, "setSecret">(
    runtime,
    KEY,
    "setSecret",
    "secrets service",
  )(key, value);
}

export async function hasEffectiveSecret(runtime: RuntimeLike, key: string) {
  return resolveMethod<Svc, "hasSecret">(
    runtime,
    KEY,
    "hasSecret",
    "secrets service",
  )(key);
}

export async function listEffectiveSecretKeys(runtime: RuntimeLike) {
  return resolveMethod<Svc, "listSecretKeys">(
    runtime,
    KEY,
    "listSecretKeys",
    "secrets service",
  )();
}
