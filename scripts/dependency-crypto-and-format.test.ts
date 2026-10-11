import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rootRequire = createRequire(
  resolve(import.meta.dirname, "../package.json"),
);
const mammothRequire = createRequire(
  rootRequire.resolve("mammoth/package.json"),
);

describe("patched transitive cryptography and formatting", () => {
  it("matches the public P-521 RFC6979 leading-zero nonce vector", () => {
    expect(rootRequire("elliptic/package.json").version).toBe("6.6.1");
    const EC = (
      rootRequire("elliptic") as {
        ec: new (
          curve: string,
        ) => {
          keyFromPrivate(privateKey: string): {
            sign(
              hash: Buffer,
              encoding?: string,
              options?: { k?: (iteration: number) => unknown },
            ): { toDER(encoding: string): string };
            getPublic(): unknown;
          };
          verify(hash: Buffer, signature: string, publicKey: unknown): boolean;
        };
      }
    ).ec;
    const ec = new EC("p521");
    const key = ec.keyFromPrivate(
      "01535d22d63de9195efd4c41358ddc89c68b6cc202b558fbf48a09e95dddf953afc1b4cfed6df0f3330f986735085e367fd07030c3ab49dcd3461197b00f09a064fb",
    );
    const hash = createHash("sha512")
      .update(Buffer.from("12f830e9591916ec", "hex"))
      .digest();
    const expected =
      "308188024201e92eeaf15414d4af3ee933825131867b6cb10234f28336ac976a99127139f23100458a9ee7184bfa64540ba385331eb3b469f491b3da013c42ad154a5907f554f0024200db3703c6d51b8a85c10c21b7643fe751781a7ad5708e3a944107f6da086afdc8532765871a9cabc81cec0f5b28ee59f0c72b48b72a39ae2d230dfb03afb9968a94";
    expect(key.sign(hash).toDER("hex")).toBe(expected);
    expect(ec.verify(hash, expected, key.getPublic())).toBe(true);
  });

  it("preserves secp256k1 and caller-provided nonce signing", () => {
    const { ec: EC } = rootRequire("elliptic") as {
      ec: new (
        curve: string,
      ) => {
        keyFromPrivate(privateKey: string): {
          sign(
            hash: Buffer,
            options?: { k: () => number },
          ): { toDER(encoding: string): string };
          getPublic(): unknown;
        };
        verify(hash: Buffer, signature: string, publicKey: unknown): boolean;
      };
    };
    const ec = new EC("secp256k1");
    const key = ec.keyFromPrivate("1");
    const hash = createHash("sha256").update("sample").digest();
    const normal = key.sign(hash).toDER("hex");
    const fixed = key.sign(hash, { k: () => 42 }).toDER("hex");
    expect(normal).not.toBe(fixed);
    expect(key.sign(hash).toDER("hex")).toBe(normal);
    expect(key.sign(hash, { k: () => 42 }).toDER("hex")).toBe(fixed);
    expect(ec.verify(hash, normal, key.getPublic())).toBe(true);
    expect(ec.verify(hash, fixed, key.getPublic())).toBe(true);
  });

  it("bounds Mammoth's sprintf precision while retaining ordinary CLI formatting", () => {
    expect(mammothRequire("sprintf-js/package.json").version).toBe("1.0.3");
    const { sprintf, vsprintf } = mammothRequire("sprintf-js") as {
      sprintf(format: string, value: number): string;
      vsprintf(format: string, values: number[]): string;
    };
    expect(sprintf("%.2f", 1.25)).toBe("1.25");
    expect(sprintf("%.0001f", 1.25)).toBe("1.3");
    expect(sprintf("%.0100f", 1.25)).toBe(sprintf("%.100f", 1.25));
    expect(sprintf("%.2e", 1.25)).toBe("1.25e+0");
    expect(sprintf("%.3g", 1.25)).toBe("1.25");
    for (const conversion of ["e", "f", "g"]) {
      const bounded = sprintf(`%.100${conversion}`, 1.25);
      expect(sprintf(`%.100000000${conversion}`, 1.25)).toBe(bounded);
      expect(vsprintf(`%.100000000${conversion}`, [1.25])).toBe(bounded);
    }
    expect(sprintf("%.0g", 1.25)).toBe(sprintf("%.1g", 1.25));
    const { ArgumentParser } = mammothRequire("argparse") as {
      ArgumentParser: new (options: {
        prog: string;
        addHelp: boolean;
      }) => {
        addArgument(names: string[], options: Record<string, unknown>): void;
        formatHelp(): string;
      };
    };
    const parser = new ArgumentParser({ prog: "mammoth", addHelp: true });
    parser.addArgument(["--amount"], {
      type: "float",
      defaultValue: 1.25,
      help: "value %(defaultValue).100000000f",
    });
    const help = parser.formatHelp();
    expect(help).toContain("value 1.");
    expect(help.length).toBeLessThan(500);
    const { status, stdout, stderr } = awaitMammothHelp();
    expect(status, stderr).toBe(0);
    expect(stdout).toContain("docx-path");
    expect(stdout).toContain("--output-format");
  });
});

function awaitMammothHelp() {
  const { spawnSync } = rootRequire(
    "node:child_process",
  ) as typeof import("node:child_process");
  return spawnSync(
    process.execPath,
    [mammothRequire.resolve("mammoth/bin/mammoth"), "--help"],
    { encoding: "utf8", timeout: 5_000 },
  );
}
