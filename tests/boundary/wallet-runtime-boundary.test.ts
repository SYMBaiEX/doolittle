import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Interface } from "ethers";
import { expect, it } from "vitest";

const agentRequire = createRequire(
  resolve("node_modules/@elizaos/agent/package.json"),
);

it("retains the real ElizaOS wallet and trading action surface without hosted mobile UI", async () => {
  const sdk = await import(
    /* @vite-ignore */ pathToFileURL(
      agentRequire.resolve("@elizaos/plugin-wallet"),
    ).href
  );
  expect(
    sdk.default.actions.map((action: { name: string }) => action.name),
  ).toEqual(
    expect.arrayContaining([
      "WALLET",
      "WALLET_TRANSFER",
      "WALLET_SWAP",
      "WALLET_BRIDGE",
    ]),
  );
  for (const name of [
    "react-native",
    "metro",
    "micromatch",
    "braces",
    "@dieub/braces-depth-guard",
    "hardhat-watcher",
    "hardhat",
  ]) {
    expect(() => agentRequire.resolve(`${name}/package.json`)).toThrow();
  }
});

it("encodes Uniswap V2-quoter calls from shipped contract artifacts without contract build tooling", () => {
  const steerRequire = createRequire(
    agentRequire.resolve("@steerprotocol/sdk"),
  );
  const { Token, CurrencyAmount, TradeType } =
    steerRequire("@uniswap/sdk-core");
  const { Pool, Route, SwapQuoter } = steerRequire("@uniswap/v3-sdk");
  const weth = new Token(
    1,
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    18,
    "WETH",
  );
  const usdc = new Token(
    1,
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    6,
    "USDC",
  );
  const pool = new Pool(
    weth,
    usdc,
    3000,
    "79228162514264337593543950336",
    "1000000000000000000",
    0,
  );
  const route = new Route([pool], weth, usdc);
  const { calldata, value } = SwapQuoter.quoteCallParameters(
    route,
    CurrencyAmount.fromRawAmount(weth, "1000"),
    TradeType.EXACT_INPUT,
    { useQuoterV2: true },
  );
  const routerRequire = createRequire(steerRequire.resolve("@uniswap/v3-sdk"));
  const { abi } = routerRequire(
    "@uniswap/swap-router-contracts/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json",
  );
  const transaction = new Interface(abi).parseTransaction({
    data: calldata,
    value,
  });
  expect(transaction?.name).toBe("quoteExactInputSingle");
  expect(transaction?.args[0].tokenIn).toBe(weth.address);
  expect(transaction?.args[0].tokenOut).toBe(usdc.address);
  expect(transaction?.args[0].amountIn).toBe(1000n);
});

it("keeps signing and typed-data recovery on the wallet plugin's actual ethers dependency", async () => {
  const walletRequire = createRequire(
    agentRequire.resolve("@elizaos/plugin-wallet"),
  );
  const { Wallet, Transaction, verifyTypedData } = walletRequire("ethers");
  // Public test vector only; no RPC, funded account, or transaction submission.
  const wallet = new Wallet(`0x${"1".padStart(64, "0")}`);
  const signed = await wallet.signTransaction({
    to: "0x0000000000000000000000000000000000000001",
    type: 2,
    chainId: 1,
    nonce: 0,
    gasLimit: 21000n,
    maxFeePerGas: 10n,
    maxPriorityFeePerGas: 1n,
    value: 123456789012345678901n,
  });
  const transaction = Transaction.from(signed);
  expect(transaction.from).toBe("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf");
  expect(transaction.value).toBe(123456789012345678901n);
  const domain = { name: "Doolittle test", version: "1", chainId: 1 };
  const types = { Amount: [{ name: "value", type: "uint256" }] };
  const value = { value: "123456789012345678901" };
  expect(
    verifyTypedData(
      domain,
      types,
      value,
      await wallet.signTypedData(domain, types, value),
    ),
  ).toBe(wallet.address);
});
