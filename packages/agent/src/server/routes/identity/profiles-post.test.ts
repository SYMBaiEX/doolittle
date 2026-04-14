import { describe, expect, it } from "bun:test";
import { handleIdentityProfilePostRoute } from "./profiles-post";
import { createIdentityTestContext } from "./test-context";

function createPostInput(
  path: string,
  body: unknown,
  nativeServices: Parameters<
    typeof handleIdentityProfilePostRoute
  >[0]["nativeServices"] = {} as Parameters<
    typeof handleIdentityProfilePostRoute
  >[0]["nativeServices"],
) {
  return {
    context: createIdentityTestContext(),
    request: new Request(`http://localhost${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    url: new URL(`http://localhost${path}`),
    nativeServices,
  };
}

describe("handleIdentityProfilePostRoute", () => {
  it("returns null for unrelated POST paths", async () => {
    const response = await handleIdentityProfilePostRoute(
      createPostInput("/profiles/unrelated", {}),
    );

    expect(response).toBeNull();
  });

  it("uses local services for note, modeling, conclude, and seed requests", async () => {
    const note = await handleIdentityProfilePostRoute(
      createPostInput("/profiles/users/note", {
        userId: "user-1",
        note: "captures local note",
        source: "test",
      }),
    );
    const modeling = await handleIdentityProfilePostRoute(
      createPostInput("/profiles/users/modeling", {
        userId: "user-1",
        userMemoryMode: "hybrid",
        dialecticMode: "assist",
      }),
    );
    const conclude = await handleIdentityProfilePostRoute(
      createPostInput("/profiles/users/conclude", {
        userId: "user-1",
        query: "latest preference",
        conclusion: "prefers direct answers",
        source: "test",
      }),
    );
    const seed = await handleIdentityProfilePostRoute(
      createPostInput("/profiles/agent/seed", {
        name: "Doolittle",
        goals: ["ship focused route slices"],
      }),
    );

    await expect(note?.json()).resolves.toEqual({
      profile: {
        userId: "user-1",
        note: "captures local note",
        source: "test",
      },
    });
    await expect(modeling?.json()).resolves.toEqual({
      profile: {
        userId: "user-1",
        config: {
          userMemoryMode: "hybrid",
          assistantMemoryMode: undefined,
          dialecticMode: "assist",
        },
      },
    });
    await expect(conclude?.json()).resolves.toEqual({
      context: { userId: "user-1", query: "latest preference" },
      conclusion: {
        userId: "user-1",
        query: "latest preference",
        conclusion: "prefers direct answers",
        source: "test",
      },
    });
    await expect(seed?.json()).resolves.toEqual({
      profile: {
        name: "Doolittle",
        goals: ["ship focused route slices"],
      },
    });
  });

  it("uses native rolodex handlers when available", async () => {
    const nativeServices = {
      rolodex: {
        remember: (
          userId: string,
          kind: string,
          value: string,
          source?: string,
        ) => ({ userId, kind, value, source, native: true }),
        observeAgent: (note: string, source?: string) => ({
          note,
          source,
          native: true,
        }),
      },
    } as Parameters<typeof handleIdentityProfilePostRoute>[0]["nativeServices"];

    const note = await handleIdentityProfilePostRoute(
      createPostInput(
        "/profiles/users/note",
        {
          userId: "user-9",
          note: "prefer native handlers",
          source: "test",
        },
        nativeServices,
      ),
    );
    const remember = await handleIdentityProfilePostRoute(
      createPostInput(
        "/profiles/users/remember",
        {
          userId: "user-9",
          kind: "fact",
          value: "likes route splits",
          source: "test",
        },
        nativeServices,
      ),
    );
    const observe = await handleIdentityProfilePostRoute(
      createPostInput(
        "/profiles/agent/observe",
        {
          note: "agent learned something",
          source: "test",
        },
        nativeServices,
      ),
    );

    await expect(note?.json()).resolves.toEqual({
      profile: {
        userId: "user-9",
        kind: "note",
        value: "prefer native handlers",
        source: "test",
        native: true,
      },
    });
    await expect(remember?.json()).resolves.toEqual({
      profile: {
        userId: "user-9",
        kind: "fact",
        value: "likes route splits",
        source: "test",
        native: true,
      },
    });
    await expect(observe?.json()).resolves.toEqual({
      profile: {
        note: "agent learned something",
        source: "test",
        native: true,
      },
    });
  });

  it("validates required POST fields", async () => {
    const invalidRemember = await handleIdentityProfilePostRoute(
      createPostInput("/profiles/users/remember", {
        userId: "user-1",
        kind: "fact",
      }),
    );
    const invalidMode = await handleIdentityProfilePostRoute(
      createPostInput("/profiles/users/mode", {
        userId: "user-1",
        mode: "remote",
      }),
    );
    const invalidConclude = await handleIdentityProfilePostRoute(
      createPostInput("/profiles/users/conclude", {
        userId: "user-1",
        query: "latest preference",
      }),
    );
    const invalidObserve = await handleIdentityProfilePostRoute(
      createPostInput("/profiles/agent/observe", {
        source: "test",
      }),
    );

    expect(invalidRemember?.status).toBe(400);
    await expect(invalidRemember?.json()).resolves.toEqual({
      error: "userId, kind, and value are required",
    });
    expect(invalidMode?.status).toBe(400);
    await expect(invalidMode?.json()).resolves.toEqual({
      error: "userId and mode are required",
    });
    expect(invalidConclude?.status).toBe(400);
    await expect(invalidConclude?.json()).resolves.toEqual({
      error: "userId, query, and conclusion are required",
    });
    expect(invalidObserve?.status).toBe(400);
    await expect(invalidObserve?.json()).resolves.toEqual({
      error: "note is required",
    });
  });
});
