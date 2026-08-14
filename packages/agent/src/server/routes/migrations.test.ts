import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleMigrationRoutes } from "@/server/routes/migrations";

function createContext() {
  return {
    services: {
      operator: {
        migrationSources: () => ["./legacy"],
        migrationHistory: (limit: number) => [{ limit }],
        inspectMigrationSource: (path: string) => ({ path, kind: "legacy" }),
        applyMigration: (
          path: string,
          options: {
            overwrite?: boolean;
          },
        ) => ({ path, overwrite: options.overwrite ?? false, ok: true }),
      },
    },
  } as unknown as AppContext;
}

describe("handleMigrationRoutes", () => {
  it("returns migration sources and history", async () => {
    const sourcesResponse = await handleMigrationRoutes(
      createContext(),
      new Request("http://localhost/migrate/sources"),
      new URL("http://localhost/migrate/sources"),
    );
    const historyResponse = await handleMigrationRoutes(
      createContext(),
      new Request("http://localhost/migrate/history?limit=4"),
      new URL("http://localhost/migrate/history?limit=4"),
    );

    await expect(sourcesResponse?.json()).resolves.toEqual({
      sources: ["./legacy"],
    });
    await expect(historyResponse?.json()).resolves.toEqual({
      history: [{ limit: 4 }],
    });
  });

  it("validates inspect and apply requests", async () => {
    const inspectBad = await handleMigrationRoutes(
      createContext(),
      new Request("http://localhost/migrate/inspect"),
      new URL("http://localhost/migrate/inspect"),
    );
    const inspectGood = await handleMigrationRoutes(
      createContext(),
      new Request("http://localhost/migrate/inspect?path=./legacy"),
      new URL("http://localhost/migrate/inspect?path=./legacy"),
    );
    const applyBad = await handleMigrationRoutes(
      createContext(),
      new Request("http://localhost/migrate/apply", {
        method: "POST",
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/migrate/apply"),
    );
    const applyGood = await handleMigrationRoutes(
      createContext(),
      new Request("http://localhost/migrate/apply", {
        method: "POST",
        body: JSON.stringify({ path: "./legacy", overwrite: true }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/migrate/apply"),
    );

    expect(inspectBad?.status).toBe(400);
    await expect(inspectGood?.json()).resolves.toEqual({
      inspection: { path: "./legacy", kind: "legacy" },
    });
    expect(applyBad?.status).toBe(400);
    await expect(applyGood?.json()).resolves.toEqual({
      result: { path: "./legacy", overwrite: true, ok: true },
    });
  });

  it("rejects malformed and non-object apply bodies before dispatch", async () => {
    const malformed = await handleMigrationRoutes(
      createContext(),
      new Request("http://localhost/migrate/apply", {
        method: "POST",
        body: "{",
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/migrate/apply"),
    );
    const array = await handleMigrationRoutes(
      createContext(),
      new Request("http://localhost/migrate/apply", {
        method: "POST",
        body: "[]",
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/migrate/apply"),
    );

    expect(malformed?.status).toBe(400);
    await expect(malformed?.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(array?.status).toBe(400);
    await expect(array?.json()).resolves.toEqual({
      error: "JSON body must be an object",
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleMigrationRoutes(
      createContext(),
      new Request("http://localhost/not-migrate"),
      new URL("http://localhost/not-migrate"),
    );

    expect(response).toBeNull();
  });
});
