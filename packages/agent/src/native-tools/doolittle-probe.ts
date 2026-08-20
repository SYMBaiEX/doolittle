import {
  createHealthProbeResult,
  resolveDoolittleApiUrl,
} from "./health-probe-core";

function printUsage(): void {
  console.log(
    "Usage: doolittle-probe [base-url]\n\nChecks the canonical Doolittle /health endpoint.\nAuthentication is read only from ELIZA_API_TOKEN.",
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--help" || args[0] === "-h") {
    printUsage();
    return;
  }
  if (args.length > 1) {
    throw new Error("Expected at most one base URL argument.");
  }

  const endpoint = resolveDoolittleApiUrl(
    args[0],
    process.env.ELIZA_API_PORT ?? process.env.DOOLITTLE_PORT,
  );
  const token = process.env.ELIZA_API_TOKEN?.trim();
  const response = await fetch(endpoint, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(10_000),
  });
  const result = createHealthProbeResult(
    endpoint,
    response.status,
    await response.text(),
  );
  console.log(JSON.stringify(result));
  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Doolittle probe failed: ${message}`);
  process.exit(1);
});
