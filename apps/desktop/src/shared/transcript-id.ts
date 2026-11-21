/** Stored connector transcript keys can be opaque, unlike new conversation IDs. */
export function isTranscriptId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 512 &&
    Boolean(value.trim()) &&
    !/[\p{Cc}\p{Cs}]/u.test(value)
  );
}
