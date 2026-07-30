import { describe, expect, it } from "vitest";
import { handleIdentityProfileRoutes } from "./profiles";
import { createIdentityTestContext } from "./test-context";

describe("handleIdentityProfileRoutes", () => {
  it("handles profile lookups and validation locally", async () => {
    const context = createIdentityTestContext();

    const search = await handleIdentityProfileRoutes(
      context,
      new Request("http://localhost/profiles/users/search?query=test&limit=4"),
      new URL("http://localhost/profiles/users/search?query=test&limit=4"),
    );
    const missingUserId = await handleIdentityProfileRoutes(
      context,
      new Request("http://localhost/profiles/users/card"),
      new URL("http://localhost/profiles/users/card"),
    );
    const mode = await handleIdentityProfileRoutes(
      context,
      new Request("http://localhost/profiles/users/mode", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          mode: "hybrid",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/profiles/users/mode"),
    );

    await expect(search?.json()).resolves.toEqual({
      hits: [{ query: "test", limit: 4 }],
    });
    expect(missingUserId?.status).toBe(400);
    await expect(missingUserId?.json()).resolves.toEqual({
      error: "userId is required",
    });
    await expect(mode?.json()).resolves.toEqual({
      profile: { userId: "user-1", mode: "hybrid" },
    });
  });

  it("uses native rolodex handlers when available", async () => {
    const context = createIdentityTestContext({
      rolodex: {
        card: (userId: string) => ({ userId, kind: "native-card" }),
        remember: (
          userId: string,
          kind: string,
          value: string,
          source?: string,
        ) => ({ userId, kind, value, source, native: true }),
      },
    });

    const card = await handleIdentityProfileRoutes(
      context,
      new Request("http://localhost/profiles/users/card?userId=user-9"),
      new URL("http://localhost/profiles/users/card?userId=user-9"),
    );
    const remember = await handleIdentityProfileRoutes(
      context,
      new Request("http://localhost/profiles/users/remember", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-9",
          kind: "fact",
          value: "likes route splits",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/profiles/users/remember"),
    );

    await expect(card?.json()).resolves.toEqual({
      card: { userId: "user-9", kind: "native-card" },
      summary: { total: 1 },
    });
    await expect(remember?.json()).resolves.toEqual({
      profile: {
        userId: "user-9",
        kind: "fact",
        value: "likes route splits",
        source: undefined,
        native: true,
      },
    });
  });

  it("supports summary aliases and conclude responses", async () => {
    const context = createIdentityTestContext();

    const summary = await handleIdentityProfileRoutes(
      context,
      new Request("http://localhost/profiles/summary"),
      new URL("http://localhost/profiles/summary"),
    );
    const conclude = await handleIdentityProfileRoutes(
      context,
      new Request("http://localhost/profiles/users/conclude", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          query: "latest preference",
          conclusion: "prefers direct answers",
          source: "test",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/profiles/users/conclude"),
    );

    await expect(summary?.json()).resolves.toEqual({
      summary: { total: 1 },
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
  });

  it("validates required POST fields", async () => {
    const response = await handleIdentityProfileRoutes(
      createIdentityTestContext(),
      new Request("http://localhost/profiles/users/remember", {
        method: "POST",
        body: JSON.stringify({
          userId: "user-1",
          kind: "fact",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/profiles/users/remember"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "userId, kind, and value are required",
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleIdentityProfileRoutes(
      createIdentityTestContext(),
      new Request("http://localhost/not-profile"),
      new URL("http://localhost/not-profile"),
    );

    expect(response).toBeNull();
  });
});
