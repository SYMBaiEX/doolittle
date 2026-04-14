import type { NativeE2BService } from "../runtime-contracts";
import { type RuntimeLike, resolveMethod, resolveService } from "./resolve";

type Svc = NativeE2BService;
const KEY = "e2b";

export function listEffectiveSandboxes(runtime: RuntimeLike) {
  const e2b = resolveService<Svc>(runtime, KEY);
  return e2b?.listSandboxes?.() ?? [];
}

export async function createEffectiveSandbox(
  runtime: RuntimeLike,
  options?: {
    template?: string;
    metadata?: Record<string, string>;
  },
) {
  return resolveMethod<Svc, "createSandbox">(
    runtime,
    KEY,
    "createSandbox",
    "E2B service",
  )(options);
}

export async function killEffectiveSandbox(runtime: RuntimeLike, id?: string) {
  return resolveMethod<Svc, "killSandbox">(
    runtime,
    KEY,
    "killSandbox",
    "E2B service",
  )(id);
}

export async function executeEffectiveSandboxCode(
  runtime: RuntimeLike,
  code: string,
  language = "python",
) {
  return resolveMethod<Svc, "executeCode">(
    runtime,
    KEY,
    "executeCode",
    "E2B service",
  )(code, language);
}
