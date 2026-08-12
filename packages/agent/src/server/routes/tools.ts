import type { ToolProfileId } from "@elizaos/core";
import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectivePluginManagerInventory,
  getEffectiveToolInventory,
  searchEffectiveTools,
  TOOL_POLICY_PROFILES,
} from "@/runtime/native/service-bridge/service-resolution";
import { json } from "@/server/responses";

function requestedProfile(url: URL): ToolProfileId | undefined {
  const profile = url.searchParams.get("profile");
  if (!profile) return undefined;
  return TOOL_POLICY_PROFILES.find((candidate) => candidate === profile);
}

export async function handleToolRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const rawProfile = url.searchParams.get("profile");
  const profile = requestedProfile(url);
  if (
    url.pathname.startsWith("/tools") &&
    rawProfile &&
    profile === undefined
  ) {
    return json(
      {
        error: `profile must be one of: ${TOOL_POLICY_PROFILES.join(", ")}`,
      },
      400,
    );
  }

  if (request.method === "GET" && url.pathname === "/tools") {
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
      { profile },
    );
    return json({
      tools: inventory.tools,
      runtimeOwned: inventory.runtimeOwned,
      policyOwned: inventory.policyOwned,
      effectiveProfile: inventory.effectiveProfile,
      ...(inventory.policyError ? { policyError: inventory.policyError } : {}),
      summary: inventory.summary,
      controlPlane: inventory.summary.controlPlane,
      nativePluginManager: getEffectivePluginManagerInventory(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/search") {
    const query = url.searchParams.get("query");
    if (!query) {
      return json({ error: "query is required" }, 400);
    }
    return json({
      results: searchEffectiveTools(context.runtime, context.services, query, {
        profile,
      }),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/summary") {
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
      { profile },
    );
    return json({
      summary: inventory.summary,
      nativePluginManager: getEffectivePluginManagerInventory(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/transports") {
    return json({
      transports: getEffectiveToolInventory(context.runtime, context.services, {
        profile,
      }).summary.transports,
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/category") {
    const category = url.searchParams.get("name");
    if (!category) {
      return json({ error: "name is required" }, 400);
    }
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
      { profile },
    );
    return json({
      category,
      tools: inventory.tools.filter(
        (tool) => tool.category.toLowerCase() === category.toLowerCase(),
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/tools/detail") {
    const id = url.searchParams.get("id");
    if (!id) {
      return json({ error: "id is required" }, 400);
    }
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
      { profile },
    );
    return json({
      tool: inventory.tools.find(
        (tool) =>
          tool.id.toLowerCase() === id.toLowerCase() ||
          tool.name.toLowerCase() === id.toLowerCase(),
      ),
    });
  }

  return null;
}
