import { describe, expect, it } from "bun:test";
import { createPluginManagerPlugin } from "./index";

describe("createPluginManagerPlugin", () => {
  it("exposes list, categories, and summary from the plugin manager service", async () => {
    const plugin = createPluginManagerPlugin({
      plugins: {
        list: () => [
          {
            id: "messaging.telegram",
            enabled: true,
            source: "official",
          },
          {
            id: "messaging.discord",
            enabled: false,
            source: "vendored",
          },
        ],
        categories: () => ({
          messaging: ["messaging.telegram", "messaging.discord"],
          execution: ["execution.shell"],
        }),
        summary: () => ({
          total: 2,
          enabled: 1,
          official: 1,
          vendored: 1,
          categories: 2,
        }),
      },
    });

    const service = (await plugin.services[0].start({} as never)) as {
      list(): unknown[];
      categories(): unknown;
      summary(): unknown;
    };
    expect(service.list()).toHaveLength(2);
    expect(service.categories()).toEqual({
      messaging: ["messaging.telegram", "messaging.discord"],
      execution: ["execution.shell"],
    });
    expect(service.summary()).toEqual({
      total: 2,
      enabled: 1,
      official: 1,
      vendored: 1,
      categories: 2,
    });
  });
});
