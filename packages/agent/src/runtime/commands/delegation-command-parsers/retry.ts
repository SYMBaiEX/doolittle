export function parseRetryPayload(payload: string): {
  id?: string;
  note?: string;
  cascadeChildren: boolean;
} {
  const [left, note] = payload.split("::").map((part) => part.trim());
  const segments = left
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const [id, ...rawOptions] = segments;
  const cascadeChildren = rawOptions.some((segment) => {
    const [key, value] = segment
      .split(":")
      .map((part) => part.trim().toLowerCase());
    return (
      key === "cascade" &&
      (value === "children" || value === "child" || value === "true")
    );
  });

  return {
    id,
    note,
    cascadeChildren,
  };
}
