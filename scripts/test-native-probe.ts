import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const executable = resolve(
  repoRoot,
  "dist",
  "native",
  process.platform === "win32" ? "doolittle-probe.exe" : "doolittle-probe",
);
const expectedToken = "native-probe-integration-token";

const server = createServer((request, response) => {
  if (
    request.url !== "/health" ||
    request.headers.authorization !== `Bearer ${expectedToken}`
  ) {
    response.writeHead(403).end("forbidden");
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ status: "ok", owner: "eliza-runtime" }));
});

await new Promise<void>((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});

try {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Native probe test server did not expose a TCP port.");
  }
  const result = await new Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }>((resolveChild, reject) => {
    const child = spawn(executable, [`http://127.0.0.1:${address.port}`], {
      env: { ...process.env, ELIZA_API_TOKEN: expectedToken },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.once("error", reject);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("close", (exitCode) => {
      resolveChild({ exitCode, stdout, stderr });
    });
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Native probe exited ${result.exitCode}: ${result.stderr.trim()}`,
    );
  }
  if (result.stdout.includes(expectedToken)) {
    throw new Error("Native probe exposed its bearer token in output.");
  }
  const output = JSON.parse(result.stdout) as {
    ok?: boolean;
    status?: number;
    body?: string;
  };
  if (
    output.ok !== true ||
    output.status !== 200 ||
    !output.body?.includes('"owner":"eliza-runtime"')
  ) {
    throw new Error(`Unexpected native probe output: ${result.stdout.trim()}`);
  }
  console.log(
    "Native Doolittle probe passed against the canonical health route.",
  );
} finally {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}
