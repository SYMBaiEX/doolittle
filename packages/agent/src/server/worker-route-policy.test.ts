import { describe, expect, it } from "vitest";
import { isWorkerApiRouteAllowed } from "./worker-route-policy";

describe("named worker API surface", () => {
  it("keeps conversation reads, chat, and bot-local project resources", () => {
    expect(isWorkerApiRouteAllowed("GET", "/runtime/bot-identity")).toBe(true);
    expect(isWorkerApiRouteAllowed("GET", "/sessions/messages")).toBe(true);
    expect(isWorkerApiRouteAllowed("POST", "/chat/runs")).toBe(true);
    expect(
      isWorkerApiRouteAllowed("POST", "/runtime/executions/stop-all"),
    ).toBe(true);
    expect(isWorkerApiRouteAllowed("GET", "/chat/runs/consult%3Aone")).toBe(
      true,
    );
    expect(
      isWorkerApiRouteAllowed("POST", "/chat/runs/consult%3Aone/cancel"),
    ).toBe(true);
    expect(isWorkerApiRouteAllowed("GET", "/chat/runs/consult%2Fother")).toBe(
      false,
    );
    expect(isWorkerApiRouteAllowed("GET", "/terminal/history")).toBe(true);
    expect(isWorkerApiRouteAllowed("GET", "/browser/status")).toBe(true);
    expect(isWorkerApiRouteAllowed("GET", "/workspace/read")).toBe(true);
    expect(isWorkerApiRouteAllowed("GET", "/repo/patch")).toBe(true);
    expect(isWorkerApiRouteAllowed("POST", "/acp/terminal/create")).toBe(true);
    expect(
      isWorkerApiRouteAllowed("GET", "/projects/project-one/resources"),
    ).toBe(true);
    expect(
      isWorkerApiRouteAllowed(
        "DELETE",
        "/projects/project-one/resources/resource-one",
      ),
    ).toBe(true);
  });

  it("blocks lead-only settings, credentials, webhooks, and unscoped model calls", () => {
    expect(isWorkerApiRouteAllowed("POST", "/settings")).toBe(false);
    expect(isWorkerApiRouteAllowed("GET", "/runtime/account-pool")).toBe(false);
    expect(isWorkerApiRouteAllowed("POST", "/webhooks/discord")).toBe(false);
    expect(isWorkerApiRouteAllowed("POST", "/v1/responses")).toBe(false);
    expect(isWorkerApiRouteAllowed("POST", "/chat")).toBe(false);
    expect(isWorkerApiRouteAllowed("POST", "/terminal/run")).toBe(false);
    expect(isWorkerApiRouteAllowed("POST", "/workspace/write")).toBe(false);
    expect(isWorkerApiRouteAllowed("POST", "/repo/mutate")).toBe(false);
    expect(isWorkerApiRouteAllowed("POST", "/workspace/write", true)).toBe(
      true,
    );
    expect(isWorkerApiRouteAllowed("POST", "/repo/mutate", true)).toBe(true);
    expect(
      isWorkerApiRouteAllowed("POST", "/projects/project-one/archive"),
    ).toBe(false);
  });
});
