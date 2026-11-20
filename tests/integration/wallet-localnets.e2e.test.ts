import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { walletActivityFromAction } from "@doolittle/contracts/wallet-activity";
import type { Action, IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { JsonRpcProvider, parseEther, Wallet } from "ethers";
import { describe, expect, it, vi } from "vitest";
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";

const agentRequire = createRequire(
  resolve("node_modules/@elizaos/agent/package.json"),
);
const walletPath = agentRequire.resolve("@elizaos/plugin-wallet");
const walletRequire = createRequire(walletPath);
const {
  Connection,
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} = walletRequire("@solana/web3.js") as typeof import("@solana/web3.js");

type WalletSdk = {
  default: { actions: Action[] };
  WALLET_BACKEND_SERVICE_TYPE: string;
  WalletBackendService: {
    start(runtime: IAgentRuntime): Promise<{ stop(): Promise<void> }>;
  };
};

function bindPort(port = 0): Promise<{ port: number; close(): Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a loopback fixture port."));
        return;
      }
      resolve({
        port: address.port,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

async function rpcPort(withWebSocket = false): Promise<number> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rpc = await bindPort();
    let socket: Awaited<ReturnType<typeof bindPort>> | undefined;
    try {
      if (withWebSocket) socket = await bindPort(rpc.port + 1);
      return rpc.port;
    } catch {
      // Solana WebSocket uses the following port.
    } finally {
      await rpc.close();
      await socket?.close();
    }
  }
  throw new Error("Could not find local chain fixture ports.");
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid)
    return;
  const exit = new Promise<void>((done) => child.once("exit", () => done()));
  child.kill("SIGTERM");
  const closed = await Promise.race([
    exit.then(() => true),
    setTimeout(1_500, false),
  ]);
  if (!closed) {
    child.kill("SIGKILL");
    await exit;
  }
}

async function withLocalChain<T>(
  command: string,
  args: (root: string, port: number) => string[],
  readyMethod: string,
  withWebSocket: boolean,
  exercise: (url: string) => Promise<T>,
): Promise<T> {
  const port = await rpcPort(withWebSocket);
  const url = `http://127.0.0.1:${port}`;
  const root = mkdtempSync(join(tmpdir(), "doolittle-wallet-localnet-"));
  const child = spawn(command, args(root, port), {
    cwd: root,
    env: isolatedRuntimeEnvironment(root),
    stdio: "ignore",
  });
  let launchError: Error | undefined;
  child.on("error", (error) => {
    launchError = error;
  });
  const loopbackFetch = globalThis.fetch.bind(globalThis);
  const networkGuard = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input, init) => {
      const requestUrl = new URL(
        input instanceof Request ? input.url : String(input),
      );
      if (requestUrl.origin !== url)
        throw new Error("Wallet fixture refused non-localnet network access.");
      return loopbackFetch(input, { ...init, redirect: "error" });
    });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (launchError) throw launchError;
      if (child.exitCode !== null)
        throw new Error(
          `${command} exited before its loopback RPC became ready.`,
        );
      try {
        const result = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: readyMethod,
            params: [],
          }),
          signal: AbortSignal.timeout(500),
        });
        ready =
          result.ok && Object.hasOwn((await result.json()) as object, "result");
      } catch (error) {
        if (
          error instanceof Error &&
          !["TypeError", "TimeoutError"].includes(error.name)
        )
          throw error;
      }
      if (ready) break;
      await setTimeout(200);
    }
    if (!ready)
      throw new Error(`${command} loopback RPC did not become ready.`);
    return await exercise(url);
  } finally {
    networkGuard.mockRestore();
    await stopChild(child);
    rmSync(root, { recursive: true, force: true });
  }
}

async function walletFixture(
  settings: Record<string, string>,
  providerFetch?: typeof fetch,
) {
  const sdk: WalletSdk = await import(
    /* @vite-ignore */ pathToFileURL(walletPath).href
  );
  const agentId = randomUUID() as UUID;
  const entityId = randomUUID() as UUID;
  const roomId = randomUUID() as UUID;
  const cache = new Map<string, unknown>();
  const services = new Map<string, unknown>();
  const runtime = {
    agentId,
    character: { settings: { chains: { evm: ["base", "mainnet"] } } },
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), log: vi.fn() },
    fetch: providerFetch,
    getSetting: (key: string) => settings[key] ?? null,
    getService: (key: string) => services.get(key) ?? null,
    getServicesByType: () => [],
    getCache: async (key: string) => cache.get(key),
    setCache: async (key: string, value: unknown) => cache.set(key, value),
    deleteCache: async (key: string) => cache.delete(key),
  } as unknown as IAgentRuntime;
  const backend = await sdk.WalletBackendService.start(runtime);
  services.set(sdk.WALLET_BACKEND_SERVICE_TYPE, backend);
  const action = sdk.default.actions.find(
    (candidate) => candidate.name === "WALLET",
  );
  if (!action) throw new Error("Wallet router action is unavailable.");
  const message = (text: string): Memory => ({
    id: randomUUID() as UUID,
    agentId,
    roomId,
    entityId,
    content: { text, source: "desktop" },
  });
  return {
    call: (
      input: Memory,
      parameters: Record<string, string | boolean | number>,
    ) => action.handler(runtime, input, undefined, { parameters }),
    message,
    close: () => backend.stop(),
  };
}

describe.skipIf(process.env.DOOLITTLE_WALLET_LOCALNET !== "1")(
  "ElizaOS wallet using disposable local chains",
  () => {
    it("signs and mines the exact EVM transfer only after the second user message", async () => {
      const payer = Wallet.createRandom();
      const recipient = Wallet.createRandom().address;
      await withLocalChain(
        "anvil",
        (_root, port) => [
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--chain-id",
          "8453",
          "--accounts",
          "0",
          "--block-time",
          "1",
        ],
        "eth_chainId",
        false,
        async (url) => {
          const provider = new JsonRpcProvider(url, 8453, { cacheTimeout: -1 });
          const f = await walletFixture({
            ELIZA_WALLET_BACKEND: "local",
            EVM_PRIVATE_KEY: payer.privateKey,
            EVM_PROVIDER_BASE: url,
            EVM_PROVIDER_MAINNET: url,
            SOLANA_RPC_URL: url,
          });
          try {
            await provider.send("anvil_setBalance", [
              payer.address,
              "0x8ac7230489e80000",
            ]);
            const transfer = {
              action: "transfer",
              target: "base",
              amount: "0.012345678901234567",
              fromToken: "ETH",
              recipient,
              mode: "execute",
            };
            const prepared = await f.call(
              f.message(`Prepare a transfer to ${recipient}`),
              {
                ...transfer,
                dryRun: true,
                mode: "prepare",
              },
            );
            expect(walletActivityFromAction("WALLET", prepared)).toMatchObject({
              status: "prepared",
              dryRun: true,
              amount: transfer.amount,
            });
            const requested = f.message(`Send ETH to ${recipient}`);
            for (const message of [requested, requested]) {
              expect(await f.call(message, transfer)).toMatchObject({
                data: { confirmationStatus: "pending" },
              });
              expect(await provider.getBalance(recipient)).toBe(0n);
            }
            expect(await f.call(f.message("no"), transfer)).toMatchObject({
              data: { confirmationStatus: "cancelled" },
            });
            expect(await provider.getTransactionCount(payer.address)).toBe(0);
            expect(
              await f.call(f.message(`Send ETH to ${recipient}`), transfer),
            ).toMatchObject({
              data: { confirmationStatus: "pending" },
            });
            const submitted = await f.call(f.message("yes"), transfer);
            const receipt = walletActivityFromAction("WALLET", submitted);
            expect(receipt).toMatchObject({
              status: "submitted",
              mode: "execute",
              amount: transfer.amount,
              transactionId: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
            });
            if (!receipt?.transactionId)
              throw new Error("The wallet returned no transaction ID.");
            expect(
              await provider.waitForTransaction(
                receipt.transactionId,
                1,
                10_000,
              ),
            ).toMatchObject({ status: 1 });
            expect(await provider.getBalance(recipient)).toBe(
              parseEther(transfer.amount),
            );
            expect(await f.call(f.message("yes"), transfer)).toMatchObject({
              data: { confirmationStatus: "pending" },
            });
            expect(await provider.getTransactionCount(payer.address)).toBe(1);

            const swap = {
              action: "swap",
              target: "base",
              fromToken: "ETH",
              toToken: recipient,
              mode: "execute",
              amount: "0.01",
            };
            const bridge = {
              action: "bridge",
              target: "base",
              toChain: "mainnet",
              fromToken: "ETH",
              recipient,
              mode: "execute",
              amount: "0.01",
            };
            for (const trade of [swap, bridge]) {
              expect(
                await f.call(
                  f.message(`Request ${trade.action} for ${recipient}`),
                  trade,
                ),
              ).toMatchObject({
                data: { confirmationStatus: "pending" },
              });
              expect(await f.call(f.message("no"), trade)).toMatchObject({
                data: { confirmationStatus: "cancelled" },
              });
            }
            expect(await provider.getTransactionCount(payer.address)).toBe(1);
          } finally {
            await f.close();
            provider.destroy();
          }
        },
      );
    }, 60_000);

    it("signs and confirms an exact native Solana transfer on a loopback validator", async () => {
      const payer = Keypair.generate();
      const recipient = Keypair.generate().publicKey;
      const faucetPort = await rpcPort();
      await withLocalChain(
        "solana-test-validator",
        (root, port) => [
          "--ledger",
          join(root, "ledger"),
          "--bind-address",
          "127.0.0.1",
          "--rpc-port",
          String(port),
          "--faucet-port",
          String(faucetPort),
        ],
        "getHealth",
        true,
        async (url) => {
          const connection = new Connection(url, "confirmed");
          const fixtureMint = Keypair.generate().publicKey.toBase58();
          const jupiter = vi.fn<typeof fetch>(async (input, init) => {
            const endpoint = new URL(String(input));
            expect(endpoint.origin).toBe(url);
            if (endpoint.pathname === "/swap/v1/quote") {
              expect(endpoint.searchParams.get("amount")).toBe("12345679");
              expect(endpoint.searchParams.get("outputMint")).toBe(fixtureMint);
              expect(endpoint.searchParams.get("slippageBps")).toBe("50");
              return Response.json({
                slippageBps: 50,
                outAmount: "1000",
                routePlan: [],
              });
            }
            expect(endpoint.pathname).toBe("/swap/v1/swap");
            expect(JSON.parse(String(init?.body))).toMatchObject({
              userPublicKey: payer.publicKey.toBase58(),
              dynamicSlippage: false,
            });
            // A harmless local transaction stands in for the quote provider's
            // serialized swap. The SDK still performs real RPC simulation.
            const { blockhash } =
              await connection.getLatestBlockhash("confirmed");
            const message = new TransactionMessage({
              payerKey: payer.publicKey,
              recentBlockhash: blockhash,
              instructions: [
                SystemProgram.transfer({
                  fromPubkey: payer.publicKey,
                  toPubkey: recipient,
                  lamports: 1_000_000,
                }),
              ],
            }).compileToV0Message();
            return Response.json({
              swapTransaction: Buffer.from(
                new VersionedTransaction(message).serialize(),
              ).toString("base64"),
            });
          });
          const f = await walletFixture(
            {
              ELIZA_WALLET_BACKEND: "local",
              SOLANA_PRIVATE_KEY: Buffer.from(payer.secretKey).toString(
                "base64",
              ),
              SOLANA_RPC_URL: url,
              EVM_PROVIDER_BASE: url,
              EVM_PROVIDER_MAINNET: url,
              SOLANA_PUBLIC_KEY: payer.publicKey.toBase58(),
              JUPITER_API_BASE_URL: `${url}/swap/v1`,
            },
            jupiter,
          );
          try {
            await connection.requestAirdrop(payer.publicKey, 1_000_000_000);
            // The SDK's default preflight consults finalized state.
            await expect
              .poll(() => connection.getBalance(payer.publicKey, "finalized"), {
                timeout: 20_000,
              })
              .toBe(1_000_000_000);
            const transfer = {
              action: "transfer",
              target: "solana",
              amount: "0.012345679",
              fromToken: "SOL",
              recipient: recipient.toBase58(),
              mode: "execute",
            };
            expect(
              await f.call(
                f.message(`Send SOL to ${recipient.toBase58()}`),
                transfer,
              ),
            ).toMatchObject({
              data: { confirmationStatus: "pending" },
            });
            expect(await connection.getBalance(recipient)).toBe(0);
            const submitted = await f.call(f.message("yes"), transfer);
            const failure =
              submitted && typeof submitted === "object"
                ? submitted.text
                : undefined;
            expect(submitted, failure).toMatchObject({ success: true });
            const receipt = walletActivityFromAction("WALLET", submitted);
            expect(receipt).toMatchObject({
              chain: "solana",
              status: "submitted",
              amount: transfer.amount,
              transactionId: expect.any(String),
            });
            expect(await connection.getBalance(recipient, "confirmed")).toBe(
              12_345_679,
            );
            const statuses = await connection.getSignatureStatuses([
              receipt?.transactionId ?? "",
            ]);
            expect(statuses.value[0]).toMatchObject({ err: null });
            const simulation = await f.call(
              f.message("Simulate swapping SOL"),
              {
                action: "swap",
                target: "solana",
                amount: transfer.amount,
                fromToken: "SOL",
                toToken: fixtureMint,
                mode: "simulate",
                slippageBps: 50,
              },
            );
            expect(simulation).toMatchObject({
              success: true,
              data: {
                status: "simulated",
                simulation: { success: true, effectiveSlippageBps: 50 },
              },
            });
            expect(jupiter).toHaveBeenCalledTimes(2);
            expect(await connection.getBalance(recipient, "confirmed")).toBe(
              12_345_679,
            );
          } finally {
            await f.close();
          }
        },
      );
    }, 60_000);
  },
);
