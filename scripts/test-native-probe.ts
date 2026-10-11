import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const executable = resolve(
  repoRoot,
  "dist",
  "native",
  process.platform === "win32" ? "doolittle-probe.exe" : "doolittle-probe",
);
const expectedToken = "native-probe-integration-token";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Native probe test server did not expose a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
    server.closeAllConnections();
  });
}

function runProbe(baseUrl: string, configuredPort: string) {
  return new Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }>((resolveChild, reject) => {
    const child = spawn(executable, [baseUrl], {
      env: {
        ...process.env,
        ELIZA_API_TOKEN: expectedToken,
        ELIZA_API_PORT: configuredPort,
        DOOLITTLE_PROBE_AUTH_ORIGIN: "",
      },
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
}

function assertTokenNotPrinted(output: { stdout: string; stderr: string }) {
  if (
    output.stdout.includes(expectedToken) ||
    output.stderr.includes(expectedToken)
  ) {
    throw new Error("Native probe exposed its bearer token in output.");
  }
}

let redirectTarget: string | undefined;
const trustedRequests: Array<{
  path: string | undefined;
  authorized: boolean;
}> = [];
const untrustedRequests: Array<{ path: string | undefined; hasAuth: boolean }> =
  [];
const trusted = createServer((request, response) => {
  trustedRequests.push({
    path: request.url,
    authorized: request.headers.authorization === `Bearer ${expectedToken}`,
  });
  if (redirectTarget) {
    response.writeHead(302, { location: `${redirectTarget}/health` }).end();
    return;
  }
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
const untrusted = createServer((request, response) => {
  untrustedRequests.push({
    path: request.url,
    hasAuth: request.headers.authorization !== undefined,
  });
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ status: "ok", owner: "untrusted" }));
});

try {
  const trustedOrigin = await listen(trusted);
  const untrustedOrigin = await listen(untrusted);
  const trustedPort = new URL(trustedOrigin).port;

  const success = await runProbe(trustedOrigin, trustedPort);
  assertTokenNotPrinted(success);
  if (success.exitCode !== 0) {
    throw new Error(
      `Native probe trusted health check exited ${success.exitCode}.`,
    );
  }
  const output = JSON.parse(success.stdout) as {
    ok?: boolean;
    status?: number;
    body?: string;
  };
  if (
    output.ok !== true ||
    output.status !== 200 ||
    !output.body?.includes('"owner":"eliza-runtime"') ||
    trustedRequests.length !== 1 ||
    trustedRequests[0]?.path !== "/health" ||
    !trustedRequests[0]?.authorized
  ) {
    throw new Error(
      "Native probe did not authenticate the canonical health route.",
    );
  }

  const otherOrigin = await runProbe(untrustedOrigin, trustedPort);
  assertTokenNotPrinted(otherOrigin);
  if (
    otherOrigin.exitCode !== 0 ||
    untrustedRequests.length !== 1 ||
    untrustedRequests[0]?.path !== "/health" ||
    untrustedRequests[0]?.hasAuth
  ) {
    throw new Error(
      "Native probe forwarded a token to another loopback origin.",
    );
  }

  redirectTarget = untrustedOrigin;
  const redirect = await runProbe(trustedOrigin, trustedPort);
  assertTokenNotPrinted(redirect);
  if (
    redirect.exitCode === 0 ||
    Number(trustedRequests.length) !== 2 ||
    !trustedRequests[1]?.authorized ||
    untrustedRequests.length !== 1
  ) {
    throw new Error(
      "Native probe followed a redirect or lost exact-origin auth.",
    );
  }

  console.log(
    "Native Doolittle probe passed canonical health, exact-origin, and redirect checks.",
  );
} finally {
  await Promise.all([close(trusted), close(untrusted)]);
}
