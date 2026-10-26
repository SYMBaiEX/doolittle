import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  writeJsonAtomic,
  writeJsonAtomicSync,
} from "@elizaos/agent/utils/atomic-json";
import { afterEach, expect, it, vi } from "vitest";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(resolve(tmpdir(), "doolittle-sdk-publication-"));
  dirs.push(dir);
  return { dir, path: resolve(dir, "state.json") };
}
it("keeps simultaneous SDK writes independent even within the same clock tick", async () => {
  const f = fixture();
  vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
  await Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      writeJsonAtomic(f.path, { index }),
    ),
  );
  const saved = JSON.parse(readFileSync(f.path, "utf8"));
  expect(saved.index).toBeGreaterThanOrEqual(0);
  expect(saved.index).toBeLessThan(16);
  expect(readdirSync(f.dir)).toEqual(["state.json"]);
});
for (const mode of ["sync", "async"] as const) {
  it(`does not replace an existing owner during exclusive ${mode} publication`, async () => {
    const f = fixture();
    writeJsonAtomicSync(f.path, { owner: "original" });
    if (mode === "sync")
      expect(() =>
        writeJsonAtomicSync(
          f.path,
          { owner: "replacement" },
          { exclusive: true },
        ),
      ).toThrow();
    else
      await expect(
        writeJsonAtomic(f.path, { owner: "replacement" }, { exclusive: true }),
      ).rejects.toThrow();
    expect(JSON.parse(readFileSync(f.path, "utf8"))).toEqual({
      owner: "original",
    });
  });
  it(`does not follow the SDK's former predictable ${mode} temporary filename`, async () => {
    const f = fixture();
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const victim = resolve(f.dir, "preserved.txt");
    writeFileSync(victim, "preserved");
    const predictable = `${f.path}.tmp-${process.pid}-${now}`;
    symlinkSync(victim, predictable);
    if (mode === "sync") writeJsonAtomicSync(f.path, { value: "fixture" });
    else await writeJsonAtomic(f.path, { value: "fixture" });
    expect(readFileSync(victim, "utf8")).toBe("preserved");
    expect(JSON.parse(readFileSync(f.path, "utf8"))).toEqual({
      value: "fixture",
    });
  });
}
