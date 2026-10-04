import { describe, expect, it } from "vitest";
import { isWorkerApiRouteAllowed } from "./worker-route-policy";

describe("named worker API surface", () => {
  it("keeps conversation reads, chat, and bot-local project resources", () => {
    expect(isWorkerApiRouteAllowed("GET", "/runtime/bot-identity")).toBe(true);
    expect(isWorkerApiRouteAllowed("GET", "/sessions/messages")).toBe(true);
    expect(isWorkerApiRouteAllowed("POST", "/chat/runs")).toBe(true);
    expect(isWorkerApiRouteAllowed("GET", "/terminal/history")).toBe(true);
    expect(isWorkerApiRouteAllowed("GET", "/browser/status")).toBe(true);
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
    expect(
      isWorkerApiRouteAllowed("POST", "/projects/project-one/archive"),
    ).toBe(false);
  });
});
