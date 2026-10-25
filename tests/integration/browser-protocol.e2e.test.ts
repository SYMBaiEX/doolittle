import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";

// Exercise the dependency as resolved by the ElizaOS browser provider, including
// the BiDi-over-CDP mapper that is otherwise loaded only on demand.
const providerRequire = createRequire(
  import.meta.resolve("@elizaos/plugin-browser"),
);
for (const protocol of ["cdp", "webDriverBiDi"] as const) {
  it(`operates an isolated browser through the Eliza provider's ${protocol} client`, async () => {
    const { default: puppeteer } = await import(
      pathToFileURL(providerRequire.resolve("puppeteer-core")).href
    );
    const browser = await puppeteer.launch({
      executablePath: chromium.executablePath(),
      headless: true,
      protocol,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(
        "<button onclick=\"document.querySelector('output').textContent='Ready'\">Continue</button><output>Waiting</output>",
      );
      await page.click("button");
      expect(
        await page.$eval("output", (node: Element) => node.textContent),
      ).toBe("Ready");
      expect((await page.screenshot()).byteLength).toBeGreaterThan(100);
      if (protocol === "webDriverBiDi") {
        // Invalid commands must become protocol errors through Zod 4 validation,
        // rather than crash while reading Zod 3's removed `errors` field.
        const session = await page.target().createCDPSession();
        await expect(
          session.send("DefinitelyNotARealDomain.command"),
        ).rejects.toThrow();
        await session.detach();
      }
    } finally {
      await browser.close();
    }
  }, 30_000);
}
