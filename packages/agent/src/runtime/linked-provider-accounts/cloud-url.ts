export {
  normalizeCloudSiteUrl,
  resolveCloudApiBaseUrl,
} from "@elizaos/shared/elizacloud/base-url";

export async function validateCloudBaseUrl(
  value: string,
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `Invalid cloud base URL: "${value}"`;
  }
  if (parsed.protocol !== "https:") {
    return `Cloud base URL must use HTTPS, got "${parsed.protocol}" in "${value}"`;
  }
  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname) {
    return `Invalid cloud base URL: "${value}"`;
  }
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return `Cloud base URL "${value}" points to a blocked local hostname.`;
  }
  return null;
}
