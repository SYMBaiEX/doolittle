import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

const agentRequire = createRequire(
  resolve("node_modules/@elizaos/agent/package.json"),
);
const walletRequire = createRequire(
  agentRequire.resolve("@elizaos/plugin-wallet"),
);
const tokenRequire = createRequire(walletRequire.resolve("@solana/spl-token"));
const layouts = tokenRequire("@solana/buffer-layout-utils") as Record<
  string,
  () => {
    encode(value: bigint, buffer: Buffer, offset?: number): number;
    decode(buffer: Buffer, offset?: number): bigint;
  }
>;

for (const bits of [64, 128, 192, 256]) {
  for (const suffix of ["", "be"]) {
    it(`preserves wallet u${bits}${suffix} amounts and rejects unsigned overflow`, () => {
      const layout = layouts[`u${bits}${suffix}`]?.();
      if (!layout) throw new Error("Wallet layout missing");
      const bytes = bits / 8;
      const max = (1n << BigInt(bits)) - 1n;
      const buffer = Buffer.alloc(bytes + 4, 0xa5);
      expect(layout.encode(max, buffer, 2)).toBe(bytes);
      expect(layout.decode(buffer, 2)).toBe(max);
      expect([...buffer.subarray(0, 2)]).toEqual([0xa5, 0xa5]);
      expect([...buffer.subarray(-2)]).toEqual([0xa5, 0xa5]);
      const asymmetric = 0x0102030405060708n;
      const expected = Buffer.alloc(bytes);
      expected.writeBigUInt64LE(asymmetric);
      if (suffix === "be") expected.reverse();
      layout.encode(asymmetric, buffer, 2);
      expect(buffer.subarray(2, bytes + 2)).toEqual(expected);
      expect(layout.decode(buffer, 2)).toBe(asymmetric);
      const before = Buffer.from(buffer);
      expect(() => layout.encode(-1n, buffer, 2)).toThrow();
      expect(() => layout.encode(max + 1n, buffer, 2)).toThrow();
      expect(buffer).toEqual(before);
    });
  }
}

it("does not load an unrelated parent environment during explicit embedded database creation", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-sql-env-boundary-"));
  try {
    const cwd = join(root, "workspace");
    mkdirSync(cwd);
    writeFileSync(
      join(root, ".env"),
      "DOOLITTLE_PARENT_ENV_WITNESS=unrelated\n",
    );
    const sdk = pathToFileURL(agentRequire.resolve("@elizaos/plugin-sql")).href;
    const code = `import { createDatabaseAdapter } from ${JSON.stringify(sdk)};
      createDatabaseAdapter({dataDir:${JSON.stringify(join(root, "database"))}}, '00000000-0000-4000-8000-000000000001');
      if (process.env.DOOLITTLE_PARENT_ENV_WITNESS) process.exit(2);
      process.exit(0);`;
    expect(() =>
      execFileSync(process.execPath, ["--input-type=module", "--eval", code], {
        cwd,
        timeout: 15_000,
        stdio: "pipe",
        env: { PATH: process.env.PATH, HOME: root },
      }),
    ).not.toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
