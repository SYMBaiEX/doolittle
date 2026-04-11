import { describe, expect, it } from "bun:test";
import { handleIdentityProfileRoutes } from "./profiles";
import { createIdentityTestContext } from "./test-context";

describe("handleIdentityProfileRoutes", () => {
  it("handles profile lookups and validation locally", async () => {
    const context = createIdentityTestContext();
    const nativeServices = {} as Parameters<
      typeof handleIdentityProfileRoutes
    >[3];

    const search = await handleIdentityProfileRoutes(
      context,
      new Request("http://localhost/profiles/users/search?query=test&limit=4"),
      new URL("http://localhost/profiles/users/search?query=test&limit=4"),
      nativeServices,
    );
    const missingUserId = await handleIdentityProfileRoutes(
      context,
      new Request("http://localhost/profiles/users/card"),
      new URL("http://localhost/profiles/users/card"),
      nativeServices,
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
      nativeServices,
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

  it("returns null for unrelated routes", async () => {
    const response = await handleIdentityProfileRoutes(
      createIdentityTestContext(),
      new Request("http://localhost/not-profile"),
      new URL("http://localhost/not-profile"),
      {} as Parameters<typeof handleIdentityProfileRoutes>[3],
    );

    expect(response).toBeNull();
  });
});
