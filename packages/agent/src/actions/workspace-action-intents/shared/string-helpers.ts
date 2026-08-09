export { asNonEmptyString as nonEmptyString } from "@elizaos/shared/type-guards";

export function sanitizeFindQuery(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/\- ]/gu, "").trim();
}
