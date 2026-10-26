import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as modern from "ethers";
import { describe, expect, it } from "vitest";

const consumerRequire = createRequire(
  resolve("node_modules/@elizaos/agent/package.json"),
);
describe("modern dependency consumer contracts", () => {
  it("retains UUID CommonJS and RFC name-based generation while rejecting short output buffers", () => {
    const uuid = consumerRequire("uuid");
    expect(uuid.v5("www.widgets.com", uuid.v5.DNS)).toBe(
      "21f7f8de-8051-5b89-8680-0195ef798b6a",
    );
    expect(uuid.validate(uuid.v4())).toBe(true);
    for (const generate of [uuid.v3, uuid.v5]) {
      expect(() =>
        generate("example", uuid.v5.DNS, Buffer.alloc(15)),
      ).toThrow();
      const output = Buffer.alloc(20, 0xaa);
      generate("example", uuid.v5.DNS, output, 2);
      expect([...output.subarray(0, 2)]).toEqual([0xaa, 0xaa]);
      expect([...output.subarray(18)]).toEqual([0xaa, 0xaa]);
    }
  });
});

for (const format of ["CommonJS", "ESM"]) {
  it(`retains Solana integer layout encoding with Noble in ${format}`, async () => {
    const tokenRequire = createRequire(
      resolve("node_modules/@solana/spl-token/package.json"),
    );
    const entry = tokenRequire.resolve("@solana/buffer-layout-utils");
    const codecs =
      format === "CommonJS"
        ? tokenRequire("@solana/buffer-layout-utils")
        : await import(
            /* @vite-ignore */ pathToFileURL(
              entry.replace("/cjs/index.js", "/esm/index.mjs"),
            ).href
          );
    for (const width of [8, 16, 24, 32]) {
      for (const endian of ["LE", "BE"]) {
        const layout = (
          endian === "LE" ? codecs.bigInt(width) : codecs.bigIntBE(width)
        )();
        const storage = Buffer.alloc(width + 4, 0x5a);
        expect(layout.encode(1n, storage, 2)).toBe(width);
        expect(storage.subarray(2, width + 2)).toEqual(
          Buffer.from(
            Array.from({ length: width }, (_, index) =>
              index === (endian === "LE" ? 0 : width - 1) ? 1 : 0,
            ),
          ),
        );
        expect(layout.decode(storage, 2)).toBe(1n);
        const maximum = (1n << BigInt(width * 8)) - 1n;
        layout.encode(maximum, storage, 2);
        expect(layout.decode(storage, 2)).toBe(maximum);
        expect([
          ...storage.subarray(0, 2),
          ...storage.subarray(width + 2),
        ]).toEqual([0x5a, 0x5a, 0x5a, 0x5a]);
        expect(() => layout.encode(maximum + 1n, storage, 2)).toThrow();
        expect(() => layout.encode(-1n, storage, 2)).toThrow();
      }
    }
  });
}

it("retains native computer-use image decoding with the current file parser", async () => {
  const nativeRequire = createRequire(
    resolve("node_modules/@nut-tree-fork/nut-js/package.json"),
  );
  const Jimp = nativeRequire("jimp");
  const image = new Jimp(2, 2, 0xff0000ff);
  const png = await image.getBufferAsync(Jimp.MIME_PNG);
  const decoded = await Jimp.read(png);
  expect(decoded.bitmap.width).toBe(2);
  expect(decoded.bitmap.height).toBe(2);
  expect(decoded.getPixelColor(0, 0)).toBe(0xff0000ff);
  await expect(Jimp.read(Buffer.from("not an image"))).rejects.toThrow();
});

it("retains legacy ABI and typed-data hashes while using the current ethers domain types", async () => {
  const abiRequire = createRequire(
    resolve("node_modules/@ethersproject/abi/package.json"),
  );
  const hash = abiRequire("@ethersproject/hash");
  const { Interface } = abiRequire("@ethersproject/abi");
  const abi = [
    "function quoteExactInputSingle(address,address,uint24,uint256,uint160) returns (uint256)",
  ];
  const args = [
    "0x0000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000002",
    3000,
    123456789012345678901n,
    0,
  ];
  expect(
    new Interface(abi).encodeFunctionData("quoteExactInputSingle", args),
  ).toBe(
    new modern.Interface(abi).encodeFunctionData("quoteExactInputSingle", args),
  );
  const domain = {
    name: "Doolittle fixture",
    version: "1",
    chainId: 1,
    verifyingContract: "0x0000000000000000000000000000000000000001",
  };
  const types = {
    Order: [
      { name: "amount", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
  };
  const value = { amount: "123456789012345678901", recipient: args[1] };
  expect(hash._TypedDataEncoder.hash(domain, types, value)).toBe(
    modern.TypedDataEncoder.hash(domain, types, value),
  );
  expect(
    hash.id("quoteExactInputSingle(address,address,uint24,uint256,uint160)"),
  ).toBe(
    modern.id("quoteExactInputSingle(address,address,uint24,uint256,uint160)"),
  );
  const hashRequire = createRequire(abiRequire.resolve("@ethersproject/hash"));
  expect(hashRequire("@ethersproject/abstract-signer").version).toBe(
    modern.version,
  );
  // The alias supplies domain/field declarations only. A future runtime import
  // would require an explicit compatibility review of the signer API.
  const hashRoot = resolve(
    dirname(abiRequire.resolve("@ethersproject/hash")),
    "..",
  );
  for (const folder of ["lib", "lib.esm"]) {
    for (const file of readdirSync(resolve(hashRoot, folder)).filter((file) =>
      file.endsWith(".js"),
    )) {
      expect(
        readFileSync(resolve(hashRoot, folder, file), "utf8"),
      ).not.toContain("@ethersproject/abstract-signer");
    }
  }
  expect(() => hashRequire.resolve("@ethersproject/signing-key")).toThrow();
  expect(() => hashRequire.resolve("@ethersproject/transactions")).toThrow();
  // Check declarations with library checking enabled, rather than relying on
  // the application's existing skipLibCheck setting to hide a missing type.
  const { default: ts } = await import("typescript-legacy");
  const program = ts.createProgram([resolve(hashRoot, "lib/typed-data.d.ts")], {
    strict: true,
    skipLibCheck: false,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: ["node"],
    typeRoots: [resolve("node_modules/@types")],
  });
  expect(
    ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ),
  ).toEqual([]);
});

it("retains vision image transforms and invalid-option rejection on Zod 4", async () => {
  const visionRequire = createRequire(
    resolve("node_modules/@elizaos/plugin-vision/package.json"),
  );
  const { Jimp } = visionRequire("jimp");
  const image = new Jimp({ width: 4, height: 4, color: 0x00ff00ff });
  image.crop({ x: 1, y: 1, w: 2, h: 2 }).resize({ w: 3, h: 3 });
  expect([image.bitmap.width, image.bitmap.height]).toEqual([3, 3]);
  const png = await image.getBuffer("image/png");
  expect((await Jimp.read(png)).getPixelColor(0, 0)).toBe(0x00ff00ff);
  expect(() => image.crop({ x: "invalid", y: 0, w: 1, h: 1 })).toThrow();
});

it("retains browser protocol validation errors on Zod 4", async () => {
  const entry = resolve(
    "node_modules/chromium-bidi/out/Default/gen/src/protocol-parser/protocol-parser.js",
  );
  const parser = await import(/* @vite-ignore */ pathToFileURL(entry).href);
  expect(
    parser.Browser.parseRemoveUserContextParameters({ userContext: "fixture" }),
  ).toMatchObject({ userContext: "fixture" });
  expect(() =>
    parser.Browser.parseRemoveUserContextParameters({ userContext: 1 }),
  ).toThrow(/userContext/);
});

it("retains ABI schema validation after the Zod 4 compatible abitype update", () => {
  const viemRequire = createRequire(resolve("node_modules/viem/package.json"));
  const { Abi } = viemRequire("abitype/zod");
  const abi = [
    {
      type: "function",
      name: "balanceOf",
      inputs: [{ name: "owner", type: "address" }],
      outputs: [{ type: "uint256" }],
      stateMutability: "view",
    },
  ];
  expect(Abi.parse(abi)).toEqual(abi);
  expect(Abi.safeParse([{ ...abi[0], inputs: "invalid" }]).success).toBe(false);
});
