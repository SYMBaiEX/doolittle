import type { BackendState } from "../shared/contracts";

/** Resolve only the active backend's origin-only managed-app projection. */
export async function isActiveManagedRenderUrl(
  url: URL,
  readState: () => BackendState,
  readWorkspace: () => string = () => "",
): Promise<boolean> {
  const before = readState();
  const beforeWorkspace = readWorkspace();
  if (before.phase !== "ready" || !before.url) return false;
  try {
    const runtime = new URL(before.url);
    if (
      runtime.protocol !== "http:" ||
      runtime.hostname !== "127.0.0.1" ||
      runtime.username ||
      runtime.password
    )
      return false;
    const response = await fetch(new URL("/browser/render-targets", runtime), {
      redirect: "error",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return false;
    const value: unknown = await response.json();
    const after = readState();
    if (
      after.phase !== "ready" ||
      after.url !== before.url ||
      readWorkspace() !== beforeWorkspace
    )
      return false;
    return Boolean(
      value &&
        typeof value === "object" &&
        "origins" in value &&
        Array.isArray(value.origins) &&
        value.origins.length <= 64 &&
        value.origins.includes(url.origin),
    );
  } catch {
    return false;
  }
}
