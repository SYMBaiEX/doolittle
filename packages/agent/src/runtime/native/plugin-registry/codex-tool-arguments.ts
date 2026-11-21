import { isRecord } from "../../../utils/records";

const nonNullTypes = new Set([
  "array",
  "boolean",
  "integer",
  "number",
  "object",
  "string",
]);

function disallowsNull(schema: unknown): boolean {
  if (!isRecord(schema) || schema.nullable === true) return false;
  const { type } = schema;
  if (typeof type === "string") return nonNullTypes.has(type);
  if (Array.isArray(type))
    return type.length > 0 && type.every((item) => nonNullTypes.has(item));
  if (Array.isArray(schema.enum)) return !schema.enum.includes(null);
  const alternatives = schema.anyOf ?? schema.oneOf;
  return (
    Array.isArray(alternatives) &&
    alternatives.length > 0 &&
    alternatives.every(disallowsNull)
  );
}

function stripOptionalNulls(value: unknown, schema: unknown): boolean {
  if (!isRecord(schema)) return false;
  let changed = false;
  if (Array.isArray(value) && isRecord(schema.items)) {
    for (const entry of value) {
      if (stripOptionalNulls(entry, schema.items)) changed = true;
    }
  } else if (
    isRecord(value) &&
    isRecord(schema.properties) &&
    !schema.anyOf &&
    !schema.oneOf &&
    !schema.allOf
  ) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const [name, childSchema] of Object.entries(schema.properties)) {
      if (!Object.hasOwn(value, name)) continue;
      if (
        value[name] === null &&
        !required.includes(name) &&
        disallowsNull(childSchema)
      ) {
        delete value[name];
        changed = true;
      } else if (stripOptionalNulls(value[name], childSchema)) {
        changed = true;
      }
    }
  }
  return changed;
}

/** Round-trip strict Codex placeholders through the original Eliza tool schema. */
export function normalizeCodexToolArguments(
  args: string,
  schema: unknown,
): string {
  if (!schema || !args.includes("null")) return args;
  try {
    const value: unknown = JSON.parse(args);
    if (isRecord(value) && stripOptionalNulls(value, schema))
      return JSON.stringify(value);
  } catch {
    // Preserve malformed provider output for the SDK's validation.
  }
  return args;
}
