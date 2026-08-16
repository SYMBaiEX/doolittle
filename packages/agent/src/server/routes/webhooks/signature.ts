import { createHmac, timingSafeEqual } from "node:crypto";

const SLACK_SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret?: string,
): boolean {
  if (!signingSecret) {
    return false;
  }
  if (!timestamp || !signature) {
    return false;
  }

  // Slack signs a Unix timestamp in seconds. Reject malformed and stale/future
  // values before comparing the HMAC so a captured valid callback cannot be
  // replayed indefinitely.
  if (!/^\d+$/.test(timestamp)) {
    return false;
  }
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) {
    return false;
  }
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (
    Math.abs(nowSeconds - timestampSeconds) > SLACK_SIGNATURE_MAX_AGE_SECONDS
  ) {
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Verify Meta's WhatsApp Cloud API webhook signature over the exact request
 * body. Public webhook delivery requires an app secret; local development can
 * use authenticated application routes instead of exposing this callback.
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  signature: string | null,
  appSecret?: string,
): boolean {
  if (!appSecret) {
    return false;
  }
  if (!signature?.startsWith("sha256=")) {
    return false;
  }

  const providedHex = signature.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(providedHex)) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const provided = Buffer.from(providedHex, "hex");
  try {
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}
