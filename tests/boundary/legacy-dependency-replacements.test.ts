import { createRequire } from "node:module";
import { resolve } from "node:path";
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
