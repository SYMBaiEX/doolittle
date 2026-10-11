import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { connect as connectSocket } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { Duplex } from "node:stream";
import { describe, expect, it } from "vitest";

const rootRequire = createRequire(
  resolve(import.meta.dirname, "../package.json"),
);
const hardhatRequire = createRequire(
  rootRequire.resolve("hardhat/package.json"),
);
const solcRequire = createRequire(rootRequire.resolve("solc/package.json"));
const mochaRequire = createRequire(rootRequire.resolve("mocha/package.json"));
const solanaRequire = createRequire(
  rootRequire.resolve("@solana/web3.js/package.json"),
);
const builderRequire = createRequire(
  rootRequire.resolve("app-builder-lib/package.json"),
);

function packageVersion(
  scopedRequire: NodeJS.Require,
  packageName: string,
): string {
  return (scopedRequire(`${packageName}/package.json`) as { version: string })
    .version;
}

type HttpResult = {
  statusCode: number;
  body: { text(): Promise<string> };
};

type Dispatcher = { close(): Promise<void> };

type Undici = {
  request: (
    url: string,
    options?: { method?: string; body?: string; dispatcher?: Dispatcher },
  ) => Promise<HttpResult>;
  Agent: new () => Dispatcher;
  ProxyAgent: new (url: string) => Dispatcher;
  Pool: new (
    url: string,
  ) => Dispatcher & {
    request(options: {
      path: string;
      method: string;
      body?: string;
    }): Promise<HttpResult>;
  };
  Client: new (
    url: string,
  ) => Dispatcher & {
    request(options: {
      path: string;
      method: string;
      body?: string;
    }): Promise<HttpResult>;
  };
};

function listen(server: Server): Promise<string> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Loopback server did not bind to a TCP port."));
        return;
      }
      resolveListen(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

describe("dependency security consumer contracts", () => {
  it("uses Solana web3.js with scoped Jayson 5 for single and batch loopback RPC", async () => {
    expect(packageVersion(solanaRequire, "jayson")).toBe("5.0.0");
    const { Connection } = solanaRequire("@solana/web3.js") as {
      Connection: new (
        url: string,
      ) => {
        getBlockHeight(): Promise<number>;
        _rpcBatchRequest(
          requests: { methodName: string; args: unknown[] }[],
        ): Promise<{ result: string }[]>;
      };
    };
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as
        | { id: number; method: string }
        | { id: number; method: string }[];
      const reply = (item: { id: number; method: string }) => ({
        jsonrpc: "2.0",
        id: item.id,
        result: item.method === "getBlockHeight" ? 12345 : item.method,
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify(
          Array.isArray(parsed) ? parsed.map(reply) : reply(parsed),
        ),
      );
    });
    try {
      const origin = await listen(server);
      const connection = new Connection(origin);
      expect(await connection.getBlockHeight()).toBe(12345);
      const results = await connection._rpcBatchRequest([
        { methodName: "a", args: [] },
        { methodName: "b", args: [] },
      ]);
      expect(results.map((result) => result.result)).toEqual(["a", "b"]);
    } finally {
      await close(server);
    }
  });

  it("uses app-builder-lib with scoped electron/get 5 for checked loopback downloads", async () => {
    const getEntry = builderRequire.resolve("@electron/get");
    expect(
      JSON.parse(readFileSync(resolve(getEntry, "../../package.json"), "utf8"))
        .version,
    ).toBe("5.1.0");
    const { download } = builderRequire("app-builder-lib/out/binDownload") as {
      download(url: string, output: string, checksum: string): Promise<void>;
    };
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-electron-get-"));
    const payload = Buffer.from("controlled artifact");
    const digest = createHash("sha256").update(payload).digest("hex");
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(payload);
    });
    const oldCache = process.env.ELECTRON_BUILDER_CACHE;
    try {
      process.env.ELECTRON_BUILDER_CACHE = directory;
      const origin = await listen(server);
      const output = resolve(directory, "downloaded.bin");
      await download(`${origin}/good.bin`, output, digest);
      expect(readFileSync(output)).toEqual(payload);
      await expect(
        download(
          `${origin}/bad.bin`,
          resolve(directory, "bad.bin"),
          "0".repeat(64),
        ),
      ).rejects.toThrow();
      expect(existsSync(resolve(directory, "bad.bin"))).toBe(false);
    } finally {
      if (oldCache === undefined) delete process.env.ELECTRON_BUILDER_CACHE;
      else process.env.ELECTRON_BUILDER_CACHE = oldCache;
      await close(server);
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("resolves Hardhat's patched adm-zip and extracts a small local archive", () => {
    expect(packageVersion(hardhatRequire, "adm-zip")).toBe("0.6.1");
    const AdmZip = hardhatRequire("adm-zip") as new (
      input?: Buffer,
    ) => {
      addFile(name: string, data: Buffer): unknown;
      toBuffer(): Buffer;
      extractAllTo(path: string): void;
    };
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-adm-zip-"));
    try {
      const archive = new AdmZip();
      archive.addFile("proof.txt", Buffer.from("local archive"));
      const path = resolve(directory, "archive.zip");
      writeFileSync(path, archive.toBuffer());

      const extracted = resolve(directory, "extracted");
      new AdmZip(readFileSync(path)).extractAllTo(extracted);

      expect(readFileSync(resolve(extracted, "proof.txt"), "utf8")).toBe(
        "local archive",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a malformed declared-size ZIP bomb without a huge allocation", () => {
    const AdmZip = hardhatRequire("adm-zip") as new (
      input?: Buffer,
    ) => {
      addFile(name: string, data: Buffer): { header: { method: number } };
      toBuffer(): Buffer;
      extractAllTo(path: string): void;
    };
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-zip-bomb-"));
    const expectedLargeDeclaredSize = 0x40000000;
    const maximumAllowedAllocation = 1024 * 1024;
    let largeAllocationRequested = false;
    const originalAlloc = Buffer.alloc;
    try {
      const archive = new AdmZip();
      const entry = archive.addFile("bomb.bin", Buffer.from("tiny"));
      entry.header.method = 0;
      const malformed = archive.toBuffer();
      const centralDirectory = malformed.indexOf(
        Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      );
      if (centralDirectory < 0)
        throw new Error("ZIP fixture has no central directory.");
      malformed.writeUInt32LE(0xffffffff, centralDirectory + 16);
      malformed.writeUInt32LE(expectedLargeDeclaredSize, centralDirectory + 24);
      malformed.writeUInt32LE(0xffffffff, 14);

      Buffer.alloc = ((size, fill, encoding) => {
        if (size > maximumAllowedAllocation) {
          largeAllocationRequested = true;
          throw new Error("Blocked an oversized ZIP allocation in the test.");
        }
        return originalAlloc(size, fill, encoding);
      }) as typeof Buffer.alloc;

      expect(() =>
        new AdmZip(malformed).extractAllTo(resolve(directory, "extracted")),
      ).toThrow(/CRC/u);
      expect(largeAllocationRequested).toBe(false);
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      Buffer.alloc = originalAlloc;
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses Hardhat's patched Undici for local download and JSON-RPC calls", async () => {
    expect(packageVersion(hardhatRequire, "undici")).toBe("6.29.0");
    const undici = hardhatRequire("undici") as Undici;
    const server = createServer(async (request, response) => {
      if (request.url === "/download") {
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.end("loopback-download");
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        id: number;
        method: string;
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result: body.method }),
      );
    });
    const proxy = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("loopback-proxy");
    });
    const proxySockets = new Set<Duplex>();
    proxy.on("connect", (request, clientSocket, head) => {
      const [host, rawPort] = (request.url ?? "").split(":");
      const port = Number(rawPort);
      if (host !== "127.0.0.1" || !Number.isInteger(port)) {
        clientSocket.destroy();
        return;
      }
      const upstream = connectSocket(port, host, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length > 0) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      proxySockets.add(clientSocket);
      proxySockets.add(upstream);
      clientSocket.on("close", () => proxySockets.delete(clientSocket));
      upstream.on("close", () => proxySockets.delete(upstream));
    });
    let origin = "";
    let proxyOrigin = "";
    const dispatchers: Dispatcher[] = [];
    try {
      origin = await listen(server);
      proxyOrigin = await listen(proxy);
      const agent = new undici.Agent();
      dispatchers.push(agent);
      const downloaded = await undici.request(`${origin}/download`, {
        dispatcher: agent,
      });
      expect(downloaded.statusCode).toBe(200);
      expect(await downloaded.body.text()).toBe("loopback-download");

      const pool = new undici.Pool(origin);
      dispatchers.push(pool);
      const poolResponse = await pool.request({
        path: "/jsonrpc",
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "pool" }),
      });
      expect(JSON.parse(await poolResponse.body.text())).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: "pool",
      });

      const client = new undici.Client(origin);
      dispatchers.push(client);
      const clientResponse = await client.request({
        path: "/jsonrpc",
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "client" }),
      });
      expect(JSON.parse(await clientResponse.body.text())).toEqual({
        jsonrpc: "2.0",
        id: 2,
        result: "client",
      });

      const proxyAgent = new undici.ProxyAgent(proxyOrigin);
      dispatchers.push(proxyAgent);
      const proxied = await undici.request(`${origin}/download`, {
        dispatcher: proxyAgent,
      });
      expect(proxied.statusCode).toBe(200);
      expect(await proxied.body.text()).toBe("loopback-download");
    } finally {
      await Promise.all(dispatchers.map((dispatcher) => dispatcher.close()));
      for (const socket of proxySockets) socket.destroy();
      await Promise.all([close(server), close(proxy)]);
    }
  });

  it("uses solc's scoped tmpfile API for an SMT file and cleanup", () => {
    expect(packageVersion(solcRequire, "tmp")).toBe("0.2.7");
    const tmp = solcRequire("tmp") as {
      fileSync(options: { postfix: string }): {
        fd: number;
        name: string;
        removeCallback(): void;
      };
    };
    const temporary = tmp.fileSync({ postfix: ".smt2" });
    try {
      expect(temporary.name).toMatch(/\.smt2$/u);
      writeFileSync(temporary.fd, "(check-sat)\n");
      expect(readFileSync(temporary.name, "utf8")).toBe("(check-sat)\n");
    } finally {
      temporary.removeCallback();
    }
    expect(existsSync(temporary.name)).toBe(false);
  });

  it("keeps Mocha's function serialization and parallel CJS workers working", () => {
    expect(packageVersion(mochaRequire, "serialize-javascript")).toBe("7.1.2");
    const serialize = mochaRequire("serialize-javascript") as (
      value: unknown,
    ) => string;
    const roundTripped = Function(
      `return (${serialize({ options: { increment: (value: number) => value + 1 } })})`,
    )() as { options: { increment(value: number): number } };
    expect(roundTripped.options.increment(41)).toBe(42);

    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-mocha-"));
    try {
      const pidFile = resolve(directory, "worker-pids.txt");
      for (const name of ["one.cjs", "two.cjs"]) {
        writeFileSync(
          resolve(directory, name),
          [
            'const fs = require("node:fs");',
            'describe("parallel fixture", function () {',
            '  it("runs in a worker", function () {',
            '    fs.appendFileSync(process.env.DOOLITTLE_MOCHA_WORKER_PIDS, String(process.pid) + "\\n");',
            "    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);",
            "  });",
            "});",
          ].join("\n"),
        );
      }
      const result = spawnSync(
        process.execPath,
        [
          mochaRequire.resolve("mocha/bin/mocha.js"),
          "--parallel",
          "--jobs",
          "2",
          "--reporter",
          "dot",
          "one.cjs",
          "two.cjs",
        ],
        {
          cwd: directory,
          encoding: "utf8",
          env: { ...process.env, DOOLITTLE_MOCHA_WORKER_PIDS: pidFile },
          timeout: 8_000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      const workerPids = readFileSync(pidFile, "utf8").trim().split(/\s+/u);
      expect(new Set(workerPids).size).toBe(2);
      expect(result.stdout).toContain("2 passing");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses patched diff for Mocha's assertion reporter and preserves pass output", () => {
    expect(packageVersion(mochaRequire, "diff")).toBe("9.0.0");
    const runReporter = (fail: boolean) =>
      spawnSync(
        process.execPath,
        [
          "-e",
          `
            const Mocha = require('mocha');
            const assert = require('node:assert/strict');
            const mocha = new Mocha({ reporter: 'spec', color: false, exit: false });
            const suite = Mocha.Suite.create(mocha.suite, 'reporter smoke');
            suite.addTest(new Mocha.Test('passes', () => assert.equal(1, 1)));
            if (${fail}) {
              suite.addTest(new Mocha.Test('shows assertion diff', () => assert.equal('actual', 'expected')));
            }
            mocha.run(failures => { process.exitCode = failures ? 1 : 0; });
          `,
        ],
        {
          cwd: resolve(import.meta.dirname, ".."),
          encoding: "utf8",
          timeout: 5_000,
        },
      );

    const failed = runReporter(true);
    expect(failed.error).toBeUndefined();
    expect(failed.status, failed.stderr).toBe(1);
    expect(failed.stdout).toContain("1 passing");
    expect(failed.stdout).toContain("1 failing");
    expect(failed.stdout).toContain("+ expected - actual");
    expect(failed.stdout).toContain("-actual");
    expect(failed.stdout).toContain("+expected");
    expect(failed.stdout).not.toContain("failed to generate Mocha diff");

    const passed = runReporter(false);
    expect(passed.error).toBeUndefined();
    expect(passed.status, passed.stderr).toBe(0);
    expect(passed.stdout).toContain("1 passing");
    expect(passed.stdout).not.toContain("failing");
    expect(passed.stdout).not.toContain("+ expected - actual");
  });

  it("keeps the known-compatible shared provider and utility packages patched", () => {
    expect(packageVersion(rootRequire, "@ai-sdk/provider-utils")).toBe(
      "4.0.57",
    );
    expect(packageVersion(rootRequire, "lodash")).toBe("4.18.1");
    expect(packageVersion(rootRequire, "ws")).toBe("8.22.0");

    const lodash = rootRequire("lodash") as {
      zipObjectDeep(paths: string[], values: unknown[]): object;
    };
    lodash.zipObjectDeep(["__proto__.doolittlePolluted"], [true]);
    expect(Object.hasOwn(Object.prototype, "doolittlePolluted")).toBe(false);
  });
});
