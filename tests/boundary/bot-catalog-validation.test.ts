import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { BotCatalog } from "../../apps/desktop/src/main/bot-catalog";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function catalogFixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "doolittle-bot-catalog-"));
  directories.push(directory);
  const backend = {
    getState: () => ({ phase: "stopped" }),
    getWorkspaceDirectory: () => directory,
  } as ConstructorParameters<typeof BotCatalog>[1];
  return new BotCatalog(directory, backend, directory);
}

it("uses the canonical reasoning-effort vocabulary for named bots", () => {
  const catalog = catalogFixture();
  const accepted = catalog.create({
    name: "Reasoning",
    persona: "Reason carefully.",
    model: { provider: "offline", model: "offline", reasoningEffort: "ultra" },
  });
  expect(accepted.model.reasoningEffort).toBe("ultra");
  expect(() =>
    catalog.create({
      name: "Invalid reasoning",
      persona: "Reason carefully.",
      model: {
        provider: "offline",
        model: "offline",
        reasoningEffort: "maximum",
      },
    }),
  ).toThrow("Bot reasoning effort is invalid.");
});
