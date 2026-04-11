import { describe, expect, it } from "bun:test";
import {
  parseGatewayFiltersFromText,
  parseGatewayFiltersFromUrl,
  parseTransportPlatform,
} from "./index";

describe("gateway control-plane structure", () => {
  it("parses transport platforms from supported names", () => {
    expect(parseTransportPlatform(" Telegram ")).toBe("telegram");
    expect(parseTransportPlatform("unknown")).toBeUndefined();
  });

  it("parses gateway filters from urls with sane fallbacks", () => {
    const filters = parseGatewayFiltersFromUrl(
      new URL(
        "https://example.test/gateway?limit=4&platform=slack&session=abc&kind=deliver",
      ),
    );

    expect(filters).toEqual({
      kind: "deliver",
      limit: 4,
      platform: "slack",
      sessionId: "abc",
    });
  });

  it("parses gateway filters from shell-style text", () => {
    expect(
      parseGatewayFiltersFromText(
        "platform:discord session:room-1 kind:receive limit:12",
      ),
    ).toEqual({
      kind: "receive",
      limit: 12,
      platform: "discord",
      sessionId: "room-1",
    });
  });
});
