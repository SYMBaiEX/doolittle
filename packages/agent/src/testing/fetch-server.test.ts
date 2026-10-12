import { afterEach, describe, expect, it } from "vitest";
import { type FetchTestServer, serveFetchTest } from "./fetch-server";

const servers: FetchTestServer[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop();
});

describe("serveFetchTest", () => {
  it("serves normal responses and never sends exception details to clients", async () => {
    const captured: unknown[] = [];
    const server = await serveFetchTest(
      (request) => {
        if (new URL(request.url).pathname === "/fail") {
          throw new Error("secret=private-token");
        }
        return new Response("ok", { status: 201 });
      },
      { onError: (error) => captured.push(error) },
    );
    servers.push(server);
    const good = await fetch(server.url);
    expect(good.status).toBe(201);
    expect(await good.text()).toBe("ok");
    const bad = await fetch(new URL("/fail", server.url));
    const body = await bad.text();
    expect(bad.status).toBe(500);
    expect(body).toBe("Internal server error");
    expect(body).not.toContain("private-token");
    expect(body).not.toContain("at ");
    expect(captured).toHaveLength(1);
  });

  it("still sends a generic 500 if its diagnostic observer throws", async () => {
    const server = await serveFetchTest(
      () => {
        throw new Error("secret from handler");
      },
      {
        onError: () => {
          throw new Error("secret from observer");
        },
      },
    );
    servers.push(server);
    const response = await fetch(server.url);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Internal server error");
  });
});
