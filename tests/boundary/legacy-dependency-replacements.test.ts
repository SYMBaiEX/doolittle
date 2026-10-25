import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const consumerRequire = createRequire(
  resolve("node_modules/hardhat/package.json"),
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

it("retains WalletConnect URI parsing and shared-key encryption with the modern crypto implementation", async () => {
  const walletRequire = createRequire(
    resolve("node_modules/@walletconnect/core/package.json"),
  );
  const utils = walletRequire("@walletconnect/utils");
  const first = utils.generateKeyPair();
  const second = utils.generateKeyPair();
  const shared = utils.deriveSymKey(first.privateKey, second.publicKey);
  expect(shared).toBe(utils.deriveSymKey(second.privateKey, first.publicKey));
  const encoded = utils.encrypt({
    symKey: shared,
    message: "private fixture message",
  });
  expect(utils.decrypt({ symKey: shared, encoded })).toBe(
    "private fixture message",
  );
  expect(
    utils.parseUri(`wc:fixture@2?relay-protocol=irn&symKey=${shared}`),
  ).toMatchObject({
    topic: "fixture",
    version: 2,
    symKey: shared,
    relay: { protocol: "irn" },
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
