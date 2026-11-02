import { BidiServer } from "chromium-bidi/lib/cjs/bidiMapper/BidiMapper";
import { MapperCdpConnection } from "chromium-bidi/lib/cjs/cdp/CdpConnection";
import { expect, it } from "vitest";

it("loads the real BiDi APIs required by Playwright's browser transport", () => {
  expect(typeof BidiServer.createAndStart).toBe("function");
  expect(typeof MapperCdpConnection.prototype.createBrowserSession).toBe(
    "function",
  );
  expect(typeof MapperCdpConnection.prototype.close).toBe("function");
});
