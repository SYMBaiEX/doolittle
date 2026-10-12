const specialObjectKeys = new Set(["__proto__", "constructor", "prototype"]);

export function assertOptionalDependencyEntry(
  name: string,
  version: unknown,
  manifestPath: string,
): asserts version is string {
  if (specialObjectKeys.has(name) || typeof version !== "string") {
    throw new Error(`Unsafe optional dependency in ${manifestPath}: ${name}`);
  }
}
