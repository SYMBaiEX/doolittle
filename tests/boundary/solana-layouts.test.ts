import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import * as layouts from "@solana/buffer-layout-utils";
import { expect, it } from "vitest";

const walletRequire = createRequire(
  resolve("node_modules/@elizaos/plugin-wallet/package.json"),
);
const tokenRequire = createRequire(walletRequire.resolve("@solana/spl-token"));
const consumer = tokenRequire("@solana/buffer-layout-utils") as typeof layouts;

it("routes both module formats and the wallet's real SPL consumer to the first-party layouts", () => {
  const consumerRequire = createRequire(
    tokenRequire.resolve("@solana/buffer-layout-utils"),
  );
  const manifest = JSON.parse(
    readFileSync(
      join(
        dirname(tokenRequire.resolve("@solana/buffer-layout-utils")),
        "package.json",
      ),
      "utf8",
    ),
  );
  expect(manifest.name).toBe("@doolittle/solana-layouts");
  const amount = 0x0102030405060708n;
  const bytes = Buffer.alloc(8);
  consumer.u64().encode(amount, bytes);
  expect(layouts.u64().decode(bytes)).toBe(amount);
  const codec = JSON.parse(
    readFileSync(
      join(
        dirname(consumerRequire.resolve("noble-layout-codecs/utils.js")),
        "package.json",
      ),
      "utf8",
    ),
  );
  expect(codec.name).toBe("@noble/curves");
  expect(codec.version).toBe("2.2.0");
  expect(() =>
    createRequire(tokenRequire.resolve("@solana/buffer-layout-utils")).resolve(
      "bigint-buffer",
    ),
  ).toThrow();
});

it("preserves public-key bytes, boolean fields and replicated layout properties", () => {
  const bytes = Buffer.alloc(40, 0xa5);
  const key = layouts.publicKey().decode(Buffer.alloc(32, 7));
  const field = layouts.publicKey().replicate("owner");
  expect(field.property).toBe("owner");
  expect(field.encode(key, bytes, 4)).toBe(32);
  expect(Buffer.from(field.decode(bytes, 4).toBytes())).toEqual(
    Buffer.alloc(32, 7),
  );
  expect([...bytes.subarray(0, 4)]).toEqual([0xa5, 0xa5, 0xa5, 0xa5]);
  expect([...bytes.subarray(36)]).toEqual([0xa5, 0xa5, 0xa5, 0xa5]);
  const flag = layouts.bool("enabled");
  expect(flag.encode(true, bytes, 0)).toBe(1);
  expect(flag.decode(bytes)).toBe(true);
  flag.encode(false, bytes);
  expect(flag.decode(bytes)).toBe(false);
});

it("round-trips exact 18-place decimal amounts and rejects unsigned range errors", () => {
  const value = layouts.WAD.div(layouts.WAD).times("1.234567890123456789");
  const field = layouts.decimal("amount");
  const bytes = Buffer.alloc(20, 0xa5);
  expect(field.encode(value, bytes, 2)).toBe(16);
  expect(field.decode(bytes, 2).toFixed()).toBe("1.234567890123456789");
  expect(layouts.u128().decode(bytes, 2)).toBe(1234567890123456789n);
  const before = Buffer.from(bytes);
  expect(() => field.encode(value.negated(), bytes, 2)).toThrow();
  expect(() =>
    field.encode(layouts.WAD.times((2n ** 128n).toString()), bytes, 2),
  ).toThrow();
  expect(bytes).toEqual(before);
});

it("encodes real SPL checked-transfer instructions without wrapping wallet amounts", () => {
  const key = layouts.publicKey().decode(Buffer.alloc(32, 7));
  const token = tokenRequire("@solana/spl-token") as {
    createTransferCheckedInstruction(
      source: typeof key,
      mint: typeof key,
      destination: typeof key,
      owner: typeof key,
      amount: bigint,
      decimals: number,
    ): { data: Buffer };
  };
  const amount = 0x0102030405060708n;
  const instruction = token.createTransferCheckedInstruction(
    key,
    key,
    key,
    key,
    amount,
    9,
  );
  expect(instruction.data).toEqual(
    Buffer.from([12, 8, 7, 6, 5, 4, 3, 2, 1, 9]),
  );
  for (const invalid of [-1n, 2n ** 64n])
    expect(() =>
      token.createTransferCheckedInstruction(key, key, key, key, invalid, 9),
    ).toThrow();
});
