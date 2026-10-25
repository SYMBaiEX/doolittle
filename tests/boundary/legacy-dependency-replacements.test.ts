import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as modern from "ethers";
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

it("retains ethers v5 signing, recovery, ECDH and transaction encoding with ethers v6 crypto", async () => {
  const transactionRequire = createRequire(
    resolve("node_modules/@ethersproject/transactions/package.json"),
  );
  const legacy = transactionRequire("@ethersproject/signing-key");
  // Public test vectors only. No network calls or funded wallets.
  const firstKey = `0x${"1".padStart(64, "0")}`;
  const secondKey = `0x${"2".padStart(64, "0")}`;
  const first = new legacy.SigningKey(firstKey);
  const second = new legacy.SigningKey(secondKey);
  expect(first.compressedPublicKey).toBe(
    "0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  );
  expect(first._addPoint(first.publicKey)).toBe(second.compressedPublicKey);
  expect(first.computeSharedSecret(second.compressedPublicKey)).toBe(
    second.computeSharedSecret(first.publicKey),
  );
  expect(first.computeSharedSecret(secondKey)).toHaveLength(66);
  const digest = modern.keccak256(
    modern.toUtf8Bytes("signing migration fixture"),
  );
  const signature = first.signDigest(digest);
  const expected = new modern.SigningKey(firstKey).sign(digest);
  expect([signature.r, signature.s, signature.recoveryParam]).toEqual([
    expected.r,
    expected.s,
    expected.yParity,
  ]);
  expect(legacy.recoverPublicKey(digest, signature)).toBe(first.publicKey);
  expect(legacy.computePublicKey(first.compressedPublicKey)).toBe(
    first.publicKey,
  );
  expect(legacy.SigningKey.isSigningKey(first)).toBe(true);
  expect(() => first.signDigest("0x01")).toThrow();
  expect(() => new legacy.SigningKey(`0x${"0".repeat(64)}`)).toThrow();
  const transaction = {
    to: "0x0000000000000000000000000000000000000001",
    type: 2,
    chainId: 1,
    nonce: 0,
    gasLimit: 21000,
    maxFeePerGas: 10,
    maxPriorityFeePerGas: 1,
    value: 1,
  };
  const { serialize } = transactionRequire("@ethersproject/transactions");
  const encoded = serialize(
    transaction,
    first.signDigest(modern.keccak256(serialize(transaction))),
  );
  expect(encoded).toBe(
    await new modern.Wallet(firstKey).signTransaction(transaction),
  );
  expect(modern.Transaction.from(encoded).from).toBe(
    "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  );
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
