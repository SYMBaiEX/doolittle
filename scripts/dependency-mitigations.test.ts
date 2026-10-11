import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const braces = require("braces") as {
  (input: string, options?: { expand?: boolean }): string[];
  parse(input: string): unknown;
  compile(input: string | object): string;
  expand(input: string | object): string[];
  stringify(
    input: string | object,
    options?: { escapeInvalid?: boolean },
  ): string;
};
const bigint = require("bigint-buffer") as {
  toBigIntLE(buf: Buffer): bigint;
  toBigIntBE(buf: Buffer): bigint;
  toBufferLE(num: bigint, width: number): Buffer;
  toBufferBE(num: bigint, width: number): Buffer;
};

describe("local dependency mitigations", () => {
  it("loads the exact patched package resolutions", () => {
    expect(require("braces/package.json").version).toBe("3.0.3");
    expect(require("bigint-buffer/package.json").version).toBe("1.1.5");
  });

  it("rejects excessive brace and parenthesis nesting before recursive work", () => {
    const nestedBraces = `${"{".repeat(300)}x${"}".repeat(300)}`;
    const nestedParens = `${"(".repeat(300)}x${")".repeat(300)}`;

    for (const input of [nestedBraces, nestedParens]) {
      expect(() => braces.parse(input)).toThrow(
        /nesting exceeds maximum depth/,
      );
      expect(() => braces.compile(input)).toThrow(
        /nesting exceeds maximum depth/,
      );
      expect(() => braces.expand(input)).toThrow(
        /nesting exceeds maximum depth/,
      );
      expect(() => braces.stringify(input)).toThrow(
        /nesting exceeds maximum depth/,
      );
    }

    // A caller-provided AST bypasses parse, so each walker needs its own bound.
    let ast: object = { type: "text", value: "x" };
    for (let i = 0; i < 300; i++) {
      ast = { type: "paren", nodes: [ast] };
    }
    const root = { type: "root", nodes: [ast] };
    expect(() => braces.compile(root)).toThrow(/nesting exceeds maximum depth/);
    expect(() => braces.expand(root)).toThrow(/nesting exceeds maximum depth/);
    expect(() => braces.stringify(root)).toThrow(
      /nesting exceeds maximum depth/,
    );
  });

  it("keeps ordinary brace expansion and recovers after rejected input", () => {
    expect(braces("file.{js,ts}")).toEqual(["file.(js|ts)"]);
    expect(braces("file.{js,ts}", { expand: true })).toEqual([
      "file.js",
      "file.ts",
    ]);
    expect(braces.stringify("a/{b,c}")).toBe("a/{b,c}");
    expect(braces(`${"{".repeat(16)}x${"}".repeat(16)}`)).toHaveLength(1);
    const maximumNesting = `${"{".repeat(255)}x${"}".repeat(255)}`;
    expect(() => braces.parse(maximumNesting)).not.toThrow();
    expect(() => braces.compile(maximumNesting)).not.toThrow();
    expect(braces.expand("{a,b}")).toEqual(["a", "b"]);
  });

  it("preserves stringify escapeInvalid behavior for caller-provided ASTs", () => {
    const nestedInvalid = {
      type: "root",
      nodes: [
        {
          type: "brace",
          invalid: true,
          nodes: [
            { type: "open", value: "{" },
            { type: "text", value: "a" },
          ],
        },
      ],
    };
    // Original stringify recursion does not pass the parent to children.
    expect(braces.stringify(nestedInvalid, { escapeInvalid: true })).toBe("{a");
    expect(
      braces.stringify(
        { type: "open", invalid: true, value: "{" },
        {
          escapeInvalid: true,
        },
      ),
    ).toBe("\\{");
  });

  it("bounds a cyclic caller-provided parent chain during expansion", () => {
    const script = `
      const braces = require('braces');
      const inner = { type: 'paren', nodes: [{ type: 'paren', nodes: [] }] };
      inner.parent = inner;
      try {
        braces.expand({ type: 'root', nodes: [inner] });
        throw new Error('cyclic parent chain was accepted');
      } catch (error) {
        if (!(error instanceof SyntaxError) || !/nesting exceeds maximum depth/.test(error.message)) throw error;
      }
      if (braces.expand('{a,b}').join(',') !== 'a,b') throw new Error('expansion did not recover');
    `;
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 1000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });

  it("uses existing pure-JS bigint conversions without loading the native binding", () => {
    const script = `
      const Module = require('node:module');
      const original = Module._load;
      let nativeLoads = 0;
      Module._load = function(id, ...args) {
        if (id === 'bindings') {
          nativeLoads++;
          throw new Error('native binding was loaded');
        }
        return original.call(this, id, ...args);
      };
      const bigint = require('bigint-buffer');
      const bytes = Buffer.alloc(4097, 0);
      bytes[0] = 0x34;
      bytes[1] = 0x12;
      bytes[4096] = 0x01;
      if (bigint.toBigIntLE(bytes) !== (1n << 32768n) + 0x1234n) throw new Error('little-endian decode');
      if (bigint.toBigIntBE(Buffer.from([0x12, 0x34])) !== 0x1234n) throw new Error('big-endian decode');
      if (bigint.toBigIntLE(Buffer.alloc(0)) !== 0n) throw new Error('empty decode');
      if (bigint.toBufferLE(0x1234n, 4).toString('hex') !== '34120000') throw new Error('little-endian encode');
      if (bigint.toBufferBE(0x1234n, 4).toString('hex') !== '00001234') throw new Error('big-endian encode');
      if (nativeLoads !== 0) throw new Error('native binding was loaded');
    `;
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);

    expect(bigint.toBigIntLE(Buffer.from([0x34, 0x12]))).toBe(0x1234n);
    expect(bigint.toBufferBE(0x1234n, 2)).toEqual(Buffer.from([0x12, 0x34]));
  });
});
