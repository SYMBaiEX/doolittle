import type { Action, IAgentRuntime, Memory } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import { createShortcutCompatibleWebSearchAction } from "../../packages/plugins/doolittle-plugin/web-search-action";

it("passes the explicit query to Eliza and formats only complete structured results", async () => {
  const handler = vi.fn<Action["handler"]>().mockResolvedValue({
    success: true,
    text: JSON.stringify({
      results: [
        {
          url: "https://example.org/search",
          title: "SDK result",
          excerpt: "An answer",
        },
      ],
    }),
  });
  const action = createShortcutCompatibleWebSearchAction({
    name: "WEB_SEARCH",
    description: "Search",
    similes: [],
    examples: [],
    validate: async () => true,
    handler,
  });
  const runtime = {} as IAgentRuntime;
  const message = { content: { text: "/web: ElizaOS" } } as Memory;
  const result = await action.handler(runtime, message, undefined);
  expect(handler.mock.calls[0]?.[3]).toMatchObject({
    parameters: { query: "ElizaOS" },
  });
  expect(result).toMatchObject({
    verifiedUserFacing: true,
    userFacingText: expect.stringContaining(
      "[SDK result](https://example.org/search)",
    ),
  });

  handler.mockResolvedValueOnce({
    success: true,
    text: '{"results":[{"url":"https://example.org/","title":"Incomplete',
  });
  const malformed = await action.handler(runtime, message, undefined);
  expect(malformed).not.toHaveProperty("verifiedUserFacing");
});
