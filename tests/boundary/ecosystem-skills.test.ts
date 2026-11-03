import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { EcosystemService } from "../../packages/agent/src/services/ecosystem-service";

it("discovers the optional packs in the bundled skills workspace", () => {
  const ecosystem = new EcosystemService(resolve("packages"));
  const packs = ecosystem.optionalSkillPacks();
  expect(packs.map((pack) => pack.slug)).toEqual([
    "distribution/release-adoption",
    "operator/command-guard",
    "platform/integration-hardening",
    "research/evaluation-broader",
  ]);
  expect(packs.every((pack) => existsSync(pack.path))).toBe(true);
  expect(ecosystem.summary()).toMatchObject({
    optionalSkillPacks: 4,
    packageRoots: [{ label: "skills/.optional", exists: true }],
  });
});

it("keeps optional packs out of the SDK workspace loader", async () => {
  const require = createRequire(resolve("packages/agent/package.json"));
  const { loadSkillsFromDir } = await import(
    /* @vite-ignore */ pathToFileURL(require.resolve("@elizaos/skills/index"))
      .href
  );
  const result = loadSkillsFromDir({
    dir: resolve("packages/skills"),
    source: "workspace",
  });
  const names = result.skills.map((skill: { name: string }) => skill.name);
  expect(names).toContain("authoring");
  expect(names).not.toContain("command-guard");
  expect(names).not.toContain("release-adoption");
});
