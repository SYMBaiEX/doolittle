import { describe, expect, it } from "bun:test";
import { handleIdentityRoutes } from "./identity";
import { createIdentityTestContext } from "./identity/test-context";

describe("handleIdentityRoutes", () => {
  it("returns personality and profile summaries", async () => {
    const context = createIdentityTestContext();
    const personality = await handleIdentityRoutes(
      context,
      new Request("http://localhost/personality"),
      new URL("http://localhost/personality"),
    );
    const experience = await handleIdentityRoutes(
      context,
      new Request("http://localhost/experience"),
      new URL("http://localhost/experience"),
    );

    await expect(personality?.json()).resolves.toEqual({
      active: { id: "primary", name: "Primary" },
      available: [{ id: "primary", name: "Primary" }],
      summary: { total: 1, names: ["Primary"] },
    });
    await expect(experience?.json()).resolves.toEqual({
      summary: {
        sessions: { active: 2 },
        memory: {
          shared: { target: "memory", entries: 1 },
          user: { target: "user", entries: 1 },
        },
      },
    });
  });

  it("validates required identity inputs", async () => {
    const missingSearch = await handleIdentityRoutes(
      createIdentityTestContext(),
      new Request("http://localhost/profiles/users/search"),
      new URL("http://localhost/profiles/users/search"),
    );
    const missingBeliefs = await handleIdentityRoutes(
      createIdentityTestContext(),
      new Request("http://localhost/profiles/users/beliefs"),
      new URL("http://localhost/profiles/users/beliefs"),
    );
    const missingNote = await handleIdentityRoutes(
      createIdentityTestContext(),
      new Request("http://localhost/profiles/users/note", {
        method: "POST",
        body: JSON.stringify({ userId: "user-1" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/profiles/users/note"),
    );

    expect(missingSearch?.status).toBe(400);
    await expect(missingSearch?.json()).resolves.toEqual({
      error: "query is required",
    });
    expect(missingBeliefs?.status).toBe(400);
    await expect(missingBeliefs?.json()).resolves.toEqual({
      error: "userId is required",
    });
    expect(missingNote?.status).toBe(400);
    await expect(missingNote?.json()).resolves.toEqual({
      error: "userId and note are required",
    });
  });

  it("handles profile detail and mutation endpoints", async () => {
    const context = createIdentityTestContext();
    const search = await handleIdentityRoutes(
      context,
      new Request("http://localhost/profiles/users/search?query=test&limit=4"),
      new URL("http://localhost/profiles/users/search?query=test&limit=4"),
    );
    const relationship = await handleIdentityRoutes(
      context,
      new Request("http://localhost/profiles/users/relationship?userId=user-1"),
      new URL("http://localhost/profiles/users/relationship?userId=user-1"),
    );
    const remember = await handleIdentityRoutes(
      context,
      new Request("http://localhost/profiles/users/remember", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          kind: "fact",
          value: "likes Bun",
          source: "test",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/profiles/users/remember"),
    );

    await expect(search?.json()).resolves.toEqual({
      hits: [{ query: "test", limit: 4 }],
    });
    await expect(relationship?.json()).resolves.toEqual({
      relationship: { userId: "user-1", trust: "high" },
    });
    await expect(remember?.json()).resolves.toEqual({
      profile: {
        userId: "user-1",
        kind: "fact",
        value: "likes Bun",
        source: "test",
      },
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleIdentityRoutes(
      createIdentityTestContext(),
      new Request("http://localhost/not-identity"),
      new URL("http://localhost/not-identity"),
    );

    expect(response).toBeNull();
  });
});
