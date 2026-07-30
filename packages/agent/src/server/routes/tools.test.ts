import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleToolRoutes } from "./tools";

function createContext(): AppContext {
  return {
    runtime: {
      getAllActions: () => [
        {
          name: "READ_FILE",
          description: "Read workspace files.",
          similes: ["OPEN_FILE"],
        },
      ],
    },
    services: {
      tools: {
        list: () => [{ id: "tool-1" }],
        search: (query: string) => [{ id: `search:${query}` }],
        summary: () => ({
          total: 1,
          transports: [{ id: "transport-1" }],
        }),
        byCategory: (name: string) => [{ id: `category:${name}` }],
        get: (id: string) => ({ id, detail: true }),
      },
    },
  } as unknown as AppContext;
}

describe("handleToolRoutes", () => {
  it("lists tools and native plugin manager inventory", async () => {
    const response = await handleToolRoutes(
      createContext(),
      new Request("http://localhost/tools"),
      new URL("http://localhost/tools"),
    );

    const body = await response?.json();
    expect(body.tools).toEqual([
      expect.objectContaining({
        id: "READ_FILE",
        source: "eliza-action",
      }),
    ]);
    expect(body.runtimeOwned).toBe(true);
    expect(body.controlPlane).toEqual({
      total: 1,
      transports: [{ id: "transport-1" }],
    });
    expect(body).toHaveProperty("nativePluginManager");
  });

  it("validates search and detail query parameters", async () => {
    const missingSearch = await handleToolRoutes(
      createContext(),
      new Request("http://localhost/tools/search"),
      new URL("http://localhost/tools/search"),
    );
    const missingDetail = await handleToolRoutes(
      createContext(),
      new Request("http://localhost/tools/detail"),
      new URL("http://localhost/tools/detail"),
    );

    expect(missingSearch?.status).toBe(400);
    expect(await missingSearch?.json()).toEqual({ error: "query is required" });
    expect(missingDetail?.status).toBe(400);
    expect(await missingDetail?.json()).toEqual({ error: "id is required" });
  });

  it("returns search, category, summary, and detail payloads", async () => {
    const context = createContext();
    const search = await handleToolRoutes(
      context,
      new Request("http://localhost/tools/search?query=open_file"),
      new URL("http://localhost/tools/search?query=open_file"),
    );
    const category = await handleToolRoutes(
      context,
      new Request("http://localhost/tools/category?name=runtime"),
      new URL("http://localhost/tools/category?name=runtime"),
    );
    const summary = await handleToolRoutes(
      context,
      new Request("http://localhost/tools/summary"),
      new URL("http://localhost/tools/summary"),
    );
    const detail = await handleToolRoutes(
      context,
      new Request("http://localhost/tools/detail?id=read_file"),
      new URL("http://localhost/tools/detail?id=read_file"),
    );
    const searchBody = await search?.json();
    const categoryBody = await category?.json();
    const summaryBody = await summary?.json();
    const detailBody = await detail?.json();

    expect(searchBody?.results).toEqual([
      expect.objectContaining({ id: "READ_FILE" }),
    ]);
    expect(categoryBody?.tools).toEqual([
      expect.objectContaining({ id: "READ_FILE" }),
    ]);
    expect(summaryBody?.summary).toMatchObject({
      total: 1,
      enabled: 1,
      disabled: 0,
      runtimeOwned: true,
      controlPlane: {
        total: 1,
        transports: [{ id: "transport-1" }],
      },
    });
    expect(detailBody?.tool).toEqual(
      expect.objectContaining({ id: "READ_FILE" }),
    );
  });

  it("returns transports only for the transports route", async () => {
    const response = await handleToolRoutes(
      createContext(),
      new Request("http://localhost/tools/transports"),
      new URL("http://localhost/tools/transports"),
    );

    expect(await response?.json()).toEqual({
      transports: [{ transport: "native", total: 1, enabled: 1 }],
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleToolRoutes(
      createContext(),
      new Request("http://localhost/not-tools"),
      new URL("http://localhost/not-tools"),
    );

    expect(response).toBeNull();
  });
});
