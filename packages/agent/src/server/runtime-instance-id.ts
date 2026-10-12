import { randomUUID } from "node:crypto";

const runtimeInstanceIds = new WeakMap<object, string>();

/** Stable for one live runtime object, new when a worker boots a new runtime. */
export function runtimeInstanceId(runtime: object): string {
  let id = runtimeInstanceIds.get(runtime);
  if (!id) {
    id = randomUUID();
    runtimeInstanceIds.set(runtime, id);
  }
  return id;
}
