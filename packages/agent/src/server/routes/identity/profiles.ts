import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveRolodexSummary,
  getEffectiveUserBeliefs,
  getEffectiveUserEngagement,
  getEffectiveUserProfileSearch,
  getEffectiveUserProfileSummary,
  getEffectiveUserRelationship,
  type getNativeServices,
} from "@/runtime/native/service-bridge/index";
import { json } from "@/server/responses";

type NativeServices = ReturnType<typeof getNativeServices>;

function getRequiredSearchParam(url: URL, name: string): string | null {
  return url.searchParams.get(name);
}

export async function handleIdentityProfileRoutes(
  context: AppContext,
  request: Request,
  url: URL,
  nativeServices: NativeServices,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/profiles/users") {
    const userId = getRequiredSearchParam(url, "userId");
    return json({
      profiles: userId
        ? [context.services.userProfiles.get(userId)]
        : context.services.userProfiles.list(),
    });
  }

  if (request.method === "GET" && url.pathname === "/profiles/users/search") {
    const query = getRequiredSearchParam(url, "query");
    const limit = Number(url.searchParams.get("limit") ?? "10");
    if (!query) {
      return json({ error: "query is required" }, 400);
    }
    return json({
      hits: getEffectiveUserProfileSearch(
        context.runtime,
        context.services,
        query,
        Number.isFinite(limit) && limit > 0 ? limit : 10,
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/profiles/users/card") {
    const userId = getRequiredSearchParam(url, "userId");
    if (!userId) {
      return json({ error: "userId is required" }, 400);
    }
    return json({
      card:
        nativeServices.rolodex?.card(userId) ??
        context.services.userProfiles.renderCards(userId),
      summary: getEffectiveRolodexSummary(context.runtime, context.services),
    });
  }

  if (request.method === "GET" && url.pathname === "/profiles/users/recall") {
    const userId = getRequiredSearchParam(url, "userId");
    const query = getRequiredSearchParam(url, "query");
    if (!userId || !query) {
      return json({ error: "userId and query are required" }, 400);
    }
    return json({
      hits:
        nativeServices.rolodex?.recall(userId, query) ??
        context.services.userProfiles.recall(userId, query),
    });
  }

  if (request.method === "GET" && url.pathname === "/profiles/users/beliefs") {
    const userId = getRequiredSearchParam(url, "userId");
    if (!userId) {
      return json({ error: "userId is required" }, 400);
    }
    return json({
      beliefs: getEffectiveUserBeliefs(
        context.runtime,
        context.services,
        userId,
      ),
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/profiles/users/relationship"
  ) {
    const userId = getRequiredSearchParam(url, "userId");
    if (!userId) {
      return json({ error: "userId is required" }, 400);
    }
    return json({
      relationship: getEffectiveUserRelationship(
        context.runtime,
        context.services,
        userId,
      ),
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/profiles/users/engagement"
  ) {
    const userId = getRequiredSearchParam(url, "userId");
    if (!userId) {
      return json({ error: "userId is required" }, 400);
    }
    return json({
      engagement: getEffectiveUserEngagement(
        context.runtime,
        context.services,
        userId,
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/profiles/agent") {
    return json({
      profile:
        nativeServices.rolodex?.agentProfile() ??
        context.services.userProfiles.getAgent(),
      card:
        nativeServices.rolodex?.agentProfile() ??
        context.services.userProfiles.renderAgent(),
      summary: getEffectiveRolodexSummary(context.runtime, context.services),
    });
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/profiles/users/summary" ||
      url.pathname === "/profiles/summary")
  ) {
    return json({
      summary: getEffectiveUserProfileSummary(
        context.runtime,
        context.services,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/profiles/users/note") {
    const body = (await request.json()) as {
      userId?: string;
      note?: string;
      source?: string;
    };
    if (!body.userId || !body.note) {
      return json({ error: "userId and note are required" }, 400);
    }
    return json({
      profile:
        nativeServices.rolodex?.remember(
          body.userId,
          "note",
          body.note,
          body.source,
        ) ??
        context.services.userProfiles.addNote(
          body.userId,
          body.note,
          body.source,
        ),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/profiles/users/remember"
  ) {
    const body = (await request.json()) as {
      userId?: string;
      kind?:
        | "preference"
        | "fact"
        | "belief"
        | "goal"
        | "context"
        | "constraint"
        | "relationship"
        | "note"
        | "memory";
      value?: string;
      source?: string;
    };
    if (!body.userId || !body.kind || !body.value) {
      return json({ error: "userId, kind, and value are required" }, 400);
    }
    return json({
      profile:
        nativeServices.rolodex?.remember(
          body.userId,
          body.kind,
          body.value,
          body.source,
        ) ??
        context.services.userProfiles.remember(
          body.userId,
          body.kind,
          body.value,
          body.source,
        ),
    });
  }

  if (request.method === "POST" && url.pathname === "/profiles/users/mode") {
    const body = (await request.json()) as {
      userId?: string;
      mode?: "local" | "hybrid";
    };
    if (!body.userId || (body.mode !== "local" && body.mode !== "hybrid")) {
      return json({ error: "userId and mode are required" }, 400);
    }
    return json({
      profile: context.services.userProfiles.setMode(body.userId, body.mode),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/profiles/users/modeling"
  ) {
    const body = (await request.json()) as {
      userId?: string;
      userMemoryMode?: "local" | "hybrid";
      assistantMemoryMode?: "local" | "hybrid";
      dialecticMode?: "off" | "assist" | "conclude";
    };
    if (!body.userId) {
      return json({ error: "userId is required" }, 400);
    }
    return json({
      profile: context.services.userProfiles.configureModeling(body.userId, {
        userMemoryMode: body.userMemoryMode,
        assistantMemoryMode: body.assistantMemoryMode,
        dialecticMode: body.dialecticMode,
      }),
    });
  }

  if (request.method === "GET" && url.pathname === "/profiles/users/context") {
    const userId = getRequiredSearchParam(url, "userId");
    const query = getRequiredSearchParam(url, "query");
    if (!userId || !query) {
      return json({ error: "userId and query are required" }, 400);
    }
    return json({
      context: context.services.userProfiles.context(userId, query),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/profiles/users/conclude"
  ) {
    const body = (await request.json()) as {
      userId?: string;
      query?: string;
      conclusion?: string;
      source?: string;
    };
    if (!body.userId || !body.query || !body.conclusion) {
      return json({ error: "userId, query, and conclusion are required" }, 400);
    }
    return json({
      context: context.services.userProfiles.context(body.userId, body.query),
      conclusion: context.services.userProfiles.conclude(
        body.userId,
        body.query,
        body.conclusion,
        body.source,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/profiles/agent/observe") {
    const body = (await request.json()) as {
      note?: string;
      source?: string;
    };
    if (!body.note) {
      return json({ error: "note is required" }, 400);
    }
    return json({
      profile:
        nativeServices.rolodex?.observeAgent(body.note, body.source) ??
        context.services.userProfiles.observeAgent(body.note, body.source),
    });
  }

  if (request.method === "POST" && url.pathname === "/profiles/agent/seed") {
    const body = (await request.json()) as {
      name?: string;
      goals?: string[];
      strengths?: string[];
      workStyle?: string[];
      notes?: string[];
    };
    return json({
      profile: context.services.userProfiles.seedAgent(body),
    });
  }

  return null;
}
