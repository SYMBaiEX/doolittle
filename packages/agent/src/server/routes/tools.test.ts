import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleToolRoutes } from "./tools";

function createContext(): AppContext {
  return {
    runtime: {},
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
    expect(body.tools).toEqual([{ id: "tool-1" }]);
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
      new Request("http://localhost/tools/search?query=browser"),
      new URL("http://localhost/tools/search?query=browser"),
    );
    const category = await handleToolRoutes(
      context,
      new Request("http://localhost/tools/category?name=browser"),
      new URL("http://localhost/tools/category?name=browser"),
    );
    const summary = await handleToolRoutes(
      context,
      new Request("http://localhost/tools/summary"),
      new URL("http://localhost/tools/summary"),
    );
    const detail = await handleToolRoutes(
      context,
      new Request("http://localhost/tools/detail?id=tool-1"),
      new URL("http://localhost/tools/detail?id=tool-1"),
    );
    const searchBody = await search?.json();
    const categoryBody = await category?.json();
    const summaryBody = await summary?.json();
    const detailBody = await detail?.json();

    expect(searchBody?.results).toEqual([{ id: "search:browser" }]);
    expect(categoryBody?.tools).toEqual([{ id: "category:browser" }]);
    expect(summaryBody?.summary).toEqual({
      total: 1,
      transports: [{ id: "transport-1" }],
    });
    expect(detailBody?.tool).toEqual({ id: "tool-1", detail: true });
  });

  it("returns transports only for the transports route", async () => {
    const response = await handleToolRoutes(
      createContext(),
      new Request("http://localhost/tools/transports"),
      new URL("http://localhost/tools/transports"),
    );

    expect(await response?.json()).toEqual({
      transports: [{ id: "transport-1" }],
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
