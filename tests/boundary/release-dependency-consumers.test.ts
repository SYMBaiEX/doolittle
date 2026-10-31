import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it } from "vitest";

const desktopRequire = createRequire(resolve("apps/desktop/package.json"));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-dependency-consumers-"));
  roots.push(root);
  mkdirSync(join(root, "source"));
  writeFileSync(join(root, "source/main.ts"), "export const value = 1;\n");
  writeFileSync(join(root, "source/skip.ts"), "ignored\n");
  return root;
}

it("retains modern glob matching and refuses pre-aborted traversal", async () => {
  const { glob, globSync } = desktopRequire("glob");
  const cwd = fixture();
  expect(globSync("source/*.ts", { cwd }).sort()).toEqual([
    "source/main.ts",
    "source/skip.ts",
  ]);
  await expect(
    glob("**/*", { cwd, signal: AbortSignal.abort() }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

it("retains Jake's file-list include/exclude contract with the current matcher", () => {
  const jakeRequire = createRequire(
    desktopRequire.resolve("jake/package.json"),
  );
  const { FileList } = jakeRequire("filelist");
  const root = fixture();
  const files = new FileList(join(root, "source/*.ts"));
  files.exclude(join(root, "source/skip.ts"));
  expect(files.toArray()).toEqual([join(root, "source/main.ts")]);
});

it("packages and extracts ASAR content while preserving native-file unpack rules", async () => {
  const asar = desktopRequire("@electron/asar");
  const root = fixture();
  const source = join(root, "source");
  writeFileSync(
    join(source, "fixture.node"),
    "not an executable native module",
  );
  const archive = join(root, "app.asar");
  await asar.createPackageWithOptions(source, archive, { unpack: "*.node" });
  expect(asar.extractFile(archive, "main.ts").toString()).toBe(
    readFileSync(join(source, "main.ts"), "utf8"),
  );
  expect(asar.statFile(archive, "fixture.node").unpacked).toBe(true);
});

it("encodes and decodes Discord audio through the SDK's existing WebAssembly codec", async () => {
  const discordRequire = createRequire(
    desktopRequire.resolve("@elizaos/plugin-discord/package.json"),
  );
  const prism = discordRequire("prism-media");
  const options = { rate: 48_000, channels: 2, frameSize: 960 };
  const encoder = new prism.opus.Encoder(options);
  const decoder = new prism.opus.Decoder(options);
  try {
    expect(prism.opus.Encoder.type).toBe("opusscript");
    const encoded = once(encoder, "data");
    encoder.end(Buffer.alloc(960 * 2 * 2));
    const [packet] = await encoded;
    expect(packet.length).toBeGreaterThan(0);
    const decoded = once(decoder, "data");
    decoder.end(packet);
    expect((await decoded)[0].length).toBe(960 * 2 * 2);
  } finally {
    encoder.destroy();
    decoder.destroy();
  }
});

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No loopback port");
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
it("strips cross-realm custom sensitive headers on cross-origin redirects", async () => {
  const axiosRequire = createRequire(
    desktopRequire.resolve("axios/package.json"),
  );
  const redirects = axiosRequire("follow-redirects");
  let received: string | string[] | undefined;
  const destination = createServer((request, response) => {
    received = request.headers["x-fixture-credential"];
    response.end("ok");
  });
  let source: Server | undefined;
  try {
    const target = await listen(destination);
    source = createServer((_request, response) => {
      response.writeHead(302, { Location: target });
      response.end();
    });
    const url = await listen(source);
    await new Promise<void>((resolve, reject) => {
      const request = redirects.http.get(
        url,
        {
          headers: { "x-fixture-credential": "fixture-only" },
          sensitiveHeaders: runInNewContext('["x-fixture-credential"]'),
          maxRedirects: 2,
        },
        (response: IncomingMessage) => {
          response.resume();
          response.on("end", resolve);
          response.on("error", reject);
        },
      );
      request.setTimeout(2000, () =>
        request.destroy(new Error("Loopback redirect timed out")),
      );
      request.on("error", reject);
    });
    expect(received).toBeUndefined();
  } finally {
    if (source) await close(source);
    await close(destination);
  }
});
