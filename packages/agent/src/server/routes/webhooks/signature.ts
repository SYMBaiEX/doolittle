import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret?: string,
): boolean {
  if (!signingSecret) {
    return true;
  }
  if (!timestamp || !signature) {
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
 * body. The app secret is optional for local/development installs, matching the
 * existing Slack webhook behavior; once configured, every POST must carry a
 * valid sha256 HMAC.
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  signature: string | null,
  appSecret?: string,
): boolean {
  if (!appSecret) {
    return true;
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
