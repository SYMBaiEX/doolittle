import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import type { PlatformName } from "@/types";

export async function handlePairingRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/pairing/pending") {
    const platform = url.searchParams.get("platform") as PlatformName | null;
    return json({
      requests: await context.services.pairing.listPending(
        platform ?? undefined,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/pairing/approve") {
    const body = (await request.json()) as {
      platform: PlatformName;
      code: string;
    };
    return json({
      approved: await context.services.pairing.approve(
        body.platform,
        body.code,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/pairing/deny") {
    const body = (await request.json()) as {
      platform: PlatformName;
      code: string;
    };
    return json({
      denied: await context.services.pairing.deny(body.platform, body.code),
    });
  }

  return null;
}
