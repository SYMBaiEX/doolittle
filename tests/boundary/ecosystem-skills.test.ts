import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  expect(
    packs.find((pack) => pack.slug === "operator/command-guard"),
  ).toMatchObject({ description: "Harden operator commands before they run." });
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

it("uses the packaged application root for the optional catalog", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-ecosystem-"));
  const previousRoot = process.env.DOOLITTLE_REPO_ROOT;
  try {
    const skillDir = join(root, "packages/skills/.optional/operator/example");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: example\ndescription: Example.\n---\n",
    );
    process.env.DOOLITTLE_REPO_ROOT = root;
    const ecosystem = new EcosystemService();
    expect(ecosystem.optionalSkillPacks()).toMatchObject([
      {
        slug: "operator/example",
        path: join(skillDir, "SKILL.md"),
      },
    ]);
  } finally {
    if (previousRoot === undefined) delete process.env.DOOLITTLE_REPO_ROOT;
    else process.env.DOOLITTLE_REPO_ROOT = previousRoot;
    rmSync(root, { recursive: true, force: true });
  }
});
