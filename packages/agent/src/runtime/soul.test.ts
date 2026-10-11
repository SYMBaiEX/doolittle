import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findDoolittleSoulFile,
  readDoolittleSoul,
  renderDoolittleSoulContext,
} from "./soul";

const fixtures: string[] = [];

function fixture() {
  const temp = mkdtempSync(join(tmpdir(), "doolittle-soul-"));
  fixtures.push(temp);
  const workspace = join(temp, "workspace");
  const outside = join(temp, "outside");
  mkdirSync(workspace);
  mkdirSync(outside);
  return { temp, workspace, outside };
}

afterEach(() => {
  for (const path of fixtures.splice(0))
    rmSync(path, { recursive: true, force: true });
});

describe("SOUL.md workspace boundary", () => {
  it("reads the workspace SOUL, strips comments, and caps prompt text", () => {
    const { workspace } = fixture();
    writeFileSync(
      join(workspace, "SOUL.md"),
      `<!-- secret -->\n${"a".repeat(6000)}`,
    );
    expect(readDoolittleSoul(workspace).text).toBe("a".repeat(5000));
    expect(renderDoolittleSoulContext(workspace).join("\n")).not.toContain(
      "secret",
    );
  });

  it("does not discover a parent SOUL without an explicit trusted root", () => {
    const { temp, workspace } = fixture();
    writeFileSync(join(temp, "SOUL.md"), "parent private text");
    expect(findDoolittleSoulFile(workspace)).toBeUndefined();
    expect(readDoolittleSoul(workspace)).toEqual({ text: "" });
    expect(readDoolittleSoul(workspace, temp).text).toBe("parent private text");
    expect(readDoolittleSoul(temp, workspace)).toEqual({ text: "" });

    const nested = join(workspace, "src", "deep");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(workspace, "SOUL.md"), "workspace soul");
    expect(readDoolittleSoul(nested).text).toBe("");
    expect(readDoolittleSoul(nested, workspace).text).toBe("workspace soul");
  });

  it("rejects external SOUL symlinks and accepts a symlinked workspace selector", () => {
    const { temp, workspace, outside } = fixture();
    const target = join(outside, "secret.md");
    writeFileSync(target, "external private text");
    const soul = join(workspace, "SOUL.md");
    symlinkSync(target, soul);
    expect(findDoolittleSoulFile(workspace)).toBeUndefined();
    expect(renderDoolittleSoulContext(workspace)).toEqual([]);
    rmSync(soul);
    writeFileSync(soul, "approved soul");
    const alias = join(temp, "workspace-alias");
    symlinkSync(workspace, alias, "dir");
    expect(readDoolittleSoul(alias).text).toBe("approved soul");
    rmSync(soul);
    symlinkSync(target, soul);
    expect(renderDoolittleSoulContext(alias)).toEqual([]);
  });

  it("rejects oversized and nonregular entries without blocking on a FIFO", () => {
    const { workspace } = fixture();
    const soul = join(workspace, "SOUL.md");
    writeFileSync(soul, "x".repeat(1024 * 1024 + 1));
    expect(readDoolittleSoul(workspace).text).toBe("");
    rmSync(soul);
    mkdirSync(soul);
    expect(readDoolittleSoul(workspace).text).toBe("");
    if (process.platform !== "win32") {
      rmSync(soul, { recursive: true });
      execFileSync("mkfifo", [soul]);
      expect(readDoolittleSoul(workspace).text).toBe("");
    }
  });

  it("sees edits, deletion, recreation, and same-mtime inode replacement", () => {
    const { workspace } = fixture();
    const soul = join(workspace, "SOUL.md");
    writeFileSync(soul, "first");
    expect(readDoolittleSoul(workspace).text).toBe("first");
    writeFileSync(soul, "edited");
    expect(readDoolittleSoul(workspace).text).toBe("edited");
    const timestamp = new Date("2020-01-01T00:00:00.000Z");
    utimesSync(soul, timestamp, timestamp);
    expect(readDoolittleSoul(workspace).text).toBe("edited");
    rmSync(soul);
    writeFileSync(soul, "second");
    utimesSync(soul, timestamp, timestamp);
    expect(readDoolittleSoul(workspace).text).toBe("second");
    rmSync(soul);
    expect(readDoolittleSoul(workspace).text).toBe("");
    writeFileSync(soul, "recreated");
    expect(readDoolittleSoul(workspace).text).toBe("recreated");
  });
});
