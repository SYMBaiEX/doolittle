import type { AppContext } from "@/runtime/bootstrap";
import {
  getAutonomousControlPlane,
  getNativeEcosystemSnapshot,
} from "@/runtime/native/service-bridge/index";
import { json } from "@/server/responses";
import { resolveOwnership } from "./shared";

export async function handleRuntimeEcosystemRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/runtime/ecosystem") {
    const refresh =
      url.searchParams.get("refresh") === "true" ||
      url.searchParams.get("refresh") === "1";
    return json(
      await getNativeEcosystemSnapshot(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
        refresh,
      ),
    );
  }

  if (request.method === "GET" && url.pathname === "/ecosystem") {
    return json(
      await getNativeEcosystemSnapshot(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
      ),
    );
  }

  if (request.method === "GET" && url.pathname === "/benchmarks/packs") {
    return json({
      packs: context.services.ecosystem.benchmarkPacks(),
    });
  }

  if (request.method === "GET" && url.pathname === "/skills/channels") {
    return json({
      channels: context.services.ecosystem.distributionChannels(),
    });
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/skills/optional" ||
      url.pathname === "/skills/optional-packs")
  ) {
    return json({
      optionalSkillPacks: context.services.ecosystem.optionalSkillPacks(),
    });
  }

  if (request.method === "GET" && url.pathname === "/modeling/profiles") {
    return json({
      profiles: context.services.ecosystem.modelingProfiles(),
    });
  }

  if (request.method === "GET" && url.pathname === "/insights") {
    return json({
      ownership: resolveOwnership(context),
      ecosystem: await getNativeEcosystemSnapshot(
        context.runtime,
        context.services,
        context.config,
        context.services.gatewayConfig,
      ),
      operator: await context.services.operator.setupSummary(),
    });
  }

  if (request.method === "GET" && url.pathname === "/runtime/autonomous") {
    return json(
      getAutonomousControlPlane(
        context.runtime,
        context.services,
        context.config,
      ),
    );
  }

  return null;
}
