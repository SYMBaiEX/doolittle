const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// No existing profiles, arbitrary intranet pages, or authenticated connectors.
export function managedRenderUrl(value: unknown): URL {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 4096 ||
    [...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 32 || code === 127;
    })
  ) {
    throw new Error("A managed local application URL is required.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("A managed local application URL is required.");
  }
  if (
    !/^https?:$/u.test(url.protocol) ||
    !LOCAL_HOSTS.has(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(value)
  ) {
    throw new Error(
      "Rendered captures require a credential-free managed localhost app URL with an explicit port.",
    );
  }
  return url;
}

export function renderViewport(value: { width?: unknown; height?: unknown }): {
  width: number;
  height: number;
} {
  const width = value.width ?? 1280;
  const height = value.height ?? 720;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    Number(width) < 240 ||
    Number(width) > 1920 ||
    Number(height) < 240 ||
    Number(height) > 1440
  ) {
    throw new Error(
      "Capture viewport must be 240–1920 by 240–1440 CSS pixels.",
    );
  }
  return { width: Number(width), height: Number(height) };
}

const ASSET_HOSTS = new Set([
  "images.unsplash.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
]);

/** Read-only own-origin app requests plus a small public image/font allowlist. */
export function allowRenderResource(
  target: URL,
  request: { url: string; method: string; resourceType: string },
): boolean {
  if (!["GET", "HEAD"].includes(request.method)) return false;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (
    request.resourceType === "mainFrame" ||
    request.resourceType === "subFrame"
  ) {
    return url.origin === target.origin;
  }
  if (["data:", "blob:"].includes(url.protocol)) return true;
  const sameOrigin =
    url.origin === target.origin ||
    (url.protocol === (target.protocol === "https:" ? "wss:" : "ws:") &&
      url.host === target.host);
  return (
    sameOrigin ||
    (url.protocol === "https:" &&
      (!url.port || url.port === "443") &&
      ASSET_HOSTS.has(url.hostname))
  );
}
