import { normalizeCloudSiteUrl } from "@elizaos/shared/elizacloud/base-url";

interface CloudAvailabilityResponse {
  available?: boolean;
  reason?: string;
}

const CLOUD_AVAILABILITY_TIMEOUT_MS = 10_000;

export { normalizeCloudSiteUrl };

export async function checkCloudAvailability(
  rawUrl?: string,
): Promise<string | null> {
  const siteBase = normalizeCloudSiteUrl(rawUrl);

  let response: Response;
  try {
    response = await fetch(`${siteBase}/api/compat/availability`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(CLOUD_AVAILABILITY_TIMEOUT_MS),
    });
  } catch (error) {
    return error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Cloud availability check failed.";
  }

  if (!response.ok) {
    return `HTTP ${response.status}`;
  }

  const payload = await readAvailabilityPayload(response);
  if (payload?.available === true) {
    return null;
  }

  if (typeof payload?.reason === "string" && payload.reason.trim()) {
    return payload.reason.trim();
  }

  return "Cloud service temporarily unavailable";
}

async function readAvailabilityPayload(
  response: Response,
): Promise<CloudAvailabilityResponse | null> {
  const body = await response.text();
  if (!body.trim()) {
    return null;
  }

  try {
    return JSON.parse(body) as CloudAvailabilityResponse;
  } catch {
    return null;
  }
}
