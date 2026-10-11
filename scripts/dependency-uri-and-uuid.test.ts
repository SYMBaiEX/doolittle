import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const rootRequire = createRequire(
  resolve(import.meta.dirname, "../package.json"),
);
const queryRequire = createRequire(
  rootRequire.resolve("query-string/package.json"),
);
const solflareRequire = createRequire(
  rootRequire.resolve("@solflare-wallet/sdk/package.json"),
);

type UuidGenerator = ((
  value: string,
  namespace: string,
  buffer?: Uint8Array,
  offset?: number,
) => string | Uint8Array) & { DNS: string; URL: string };
type UuidApi = {
  v3: UuidGenerator;
  v5: UuidGenerator;
  v4(): string;
  parse(value: string): Uint8Array;
  stringify(value: Uint8Array): string;
};

function checkUuidBounds(api: Pick<UuidApi, "v3" | "v5">) {
  const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  for (const generate of [api.v3, api.v5]) {
    for (const [buffer, offset] of [
      [Buffer.alloc(8, 0x5a), 0],
      [new Uint8Array(16).fill(0x5a), 1],
      [new Uint8Array(16).fill(0x5a), -1],
      [new Uint8Array(16).fill(0x5a), 1.5],
      [new Uint8Array(16).fill(0x5a), Number.POSITIVE_INFINITY],
    ] as const) {
      const before = Buffer.from(buffer);
      expect(() =>
        generate("www.example.com", namespace, buffer, offset),
      ).toThrow(RangeError);
      expect(Buffer.from(buffer)).toEqual(before);
    }
    const output = new Uint8Array(17).fill(0x5a);
    expect(generate("www.example.com", namespace, output, 1)).toBe(output);
    expect(output[0]).toBe(0x5a);
    const expected = String(generate("www.example.com", namespace));
    expect(Buffer.from(output.slice(1))).toEqual(
      Buffer.from(expected.replaceAll("-", ""), "hex"),
    );
  }
  expect(api.v5("www.example.com", namespace)).toBe(
    "2ed6657d-e927-568b-95e1-2665a8aea6a2",
  );
}

describe("URI and UUID dependency guards", () => {
  it("keeps query-string's CommonJS decoder contract for valid and malformed input", () => {
    expect(queryRequire("decode-uri-component/package.json").version).toBe(
      "0.2.2",
    );
    const decode = queryRequire("decode-uri-component") as (
      value: string,
    ) => string;
    expect(typeof decode).toBe("function");
    expect(decode("hello+world%20%C3%A5")).toBe("hello world å");
    expect(decode("%E0%A4%A")).toBe("%E0%A4%A");
    expect(decode("%FE%FF")).toBe("��");
    expect(decode("%C2")).toBe("�");
    const queryString = queryRequire("query-string") as {
      parse(query: string): Record<string, unknown>;
    };
    expect(
      queryString.parse("name=hello+world&letter=%C3%A5&bad=%E0%A4%A"),
    ).toMatchObject({
      name: "hello world",
      letter: "å",
      bad: "%E0%A4%A",
    });
  });

  it("decodes a hostile malformed-percent query within a bounded child process", () => {
    const modulePath = queryRequire.resolve("query-string");
    const script = `const query = require(${JSON.stringify(modulePath)}); const result = query.parse('value=' + '%C3%28'.repeat(4000)); if (typeof result.value !== 'string' || result.value.length === 0) process.exitCode = 2;`;
    const probe = spawnSync(process.execPath, ["-e", script], {
      encoding: "utf8",
      timeout: 2_000,
    });
    expect(probe.error).toBeUndefined();
    expect(probe.status, probe.stderr).toBe(0);
  });

  it("guards UUID v3/v5 buffers across resolved CJS, ESM node and browser entries", async () => {
    for (const [scopedRequire, version] of [
      [rootRequire, "8.3.2"],
      [solflareRequire, "9.0.1"],
    ] as const) {
      const packagePath = scopedRequire.resolve("uuid/package.json");
      expect(scopedRequire("uuid/package.json").version).toBe(version);
      const cjs = scopedRequire("uuid") as UuidApi;
      checkUuidBounds(cjs);
      const ordinary = cjs.v5("www.example.com", cjs.v5.DNS);
      expect(cjs.stringify(cjs.parse(ordinary as string))).toBe(ordinary);
      expect(cjs.v4()).toMatch(
        /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u,
      );
      for (const entry of ["esm-node", "esm-browser"]) {
        const imported = (await import(
          pathToFileURL(
            resolve(dirname(packagePath), "dist", entry, "index.js"),
          ).href
        )) as UuidApi;
        checkUuidBounds(imported);
        expect(imported.v5("www.example.com", imported.v5.DNS)).toBe(ordinary);
      }
      if (version === "9.0.1") {
        const browserRequire = createRequire(
          resolve(dirname(packagePath), "dist/commonjs-browser/index.js"),
        );
        checkUuidBounds(browserRequire("./index.js") as UuidApi);
      }
    }
  });

  it("guards UUID 8 standalone browser bundles as well as the aggregate bundle", () => {
    const root = dirname(rootRequire.resolve("uuid/package.json"));
    for (const [name, exportName] of [
      ["uuid.min.js", "v3"],
      ["uuid.min.js", "v5"],
      ["uuidv3.min.js", "v3"],
      ["uuidv5.min.js", "v5"],
    ] as const) {
      const module = { exports: {} as Record<string, unknown> };
      const source = readFileSync(resolve(root, "dist/umd", name), "utf8");
      runInNewContext(source, { module, exports: module.exports });
      const exported =
        name === "uuid.min.js" ? module.exports[exportName] : module.exports;
      const generate = exported as (
        value: string,
        namespace: string,
        buffer?: Uint8Array,
        offset?: number,
      ) => unknown;
      const buffer = new Uint8Array(8).fill(0x5a);
      expect(() =>
        generate(
          "www.example.com",
          "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
          buffer,
          0,
        ),
      ).toThrow("UUID buffer offset is out of bounds");
      expect(buffer).toEqual(new Uint8Array(8).fill(0x5a));
      const output = new Uint8Array(16);
      const ordinary = String(
        generate("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"),
      );
      expect(
        generate(
          "www.example.com",
          "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
          output,
          0,
        ),
      ).toBe(output);
      expect(Buffer.from(output)).toEqual(
        Buffer.from(ordinary.replaceAll("-", ""), "hex"),
      );
    }
  });
});
