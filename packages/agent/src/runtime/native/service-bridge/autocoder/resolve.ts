import { getNativeServices, type RuntimeLike } from "../runtime";
import type { NativeServices } from "../runtime-contracts";

type NativeMethod = (...args: never[]) => unknown;
type BoundNativeMethod<S, K extends keyof S> = Extract<
  NonNullable<S[K]>,
  NativeMethod
>;

/**
 * Resolve a native service by key and assert a method exists on it.
 * Throws a uniform error when the service or method is missing.
 */
export function resolveMethod<S, K extends keyof S>(
  runtime: RuntimeLike,
  serviceKey: keyof NativeServices,
  methodKey: K,
  label: string,
): BoundNativeMethod<S, K> {
  const service = getNativeServices(runtime)[serviceKey] as S | undefined;
  const method = service?.[methodKey] as BoundNativeMethod<S, K> | undefined;
  if (!method) {
    throw new Error(`Native ${label} is unavailable.`);
  }
  return method.bind(service) as BoundNativeMethod<S, K>;
}

/**
 * Resolve a native service by key (without requiring a specific method).
 */
export function resolveService<S>(
  runtime: RuntimeLike,
  serviceKey: keyof NativeServices,
): S | undefined {
  return getNativeServices(runtime)[serviceKey] as S | undefined;
}

export type { RuntimeLike } from "../runtime";
