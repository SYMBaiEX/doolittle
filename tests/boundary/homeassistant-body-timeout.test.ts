import { createServer } from "node:http";
import { afterEach, expect, it } from "vitest";
import { watchHomeAssistantStates } from "../../packages/agent/src/gateway/platforms/homeassistant-adapter/requests";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function connection(body?: string) {
  const server = createServer((request, response) => {
    expect(request.url).toBe("/api/states");
    response.writeHead(200, { "content-type": "application/json" });
    if (body === undefined) {
      response.flushHeaders();
      response.write("[");
    } else {
      response.end(body);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing server address");
  return {
    apiRoot: `http://127.0.0.1:${address.port}`,
    token: "fixture-token",
  };
}

it("propagates a timeout while reading Home Assistant states", async () => {
  await expect(
    watchHomeAssistantStates(await connection()),
  ).rejects.toMatchObject({ name: "TimeoutError" });
}, 20000);

it.each([
  ['[{"entity_id":"light.office"}]', 1],
  ["[]", 0],
  ["invalid JSON", 0],
])("handles a completed states body %s", async (body, count) => {
  await expect(
    watchHomeAssistantStates(await connection(body)),
  ).resolves.toMatchObject({ count });
});
