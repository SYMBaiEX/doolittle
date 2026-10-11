import {
  createHealthProbeRequest,
  createHealthProbeResult,
  resolveDoolittleApiUrl,
} from "./health-probe-core";

function printUsage(): void {
  console.log(
    "Usage: doolittle-probe [base-url]\n\nChecks the canonical Doolittle /health endpoint without redirects.\nELIZA_API_TOKEN is sent only to the configured local API origin.\nSet DOOLITTLE_PROBE_AUTH_ORIGIN to explicitly trust another origin (HTTPS required remotely).",
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

  const configuredPort =
    process.env.ELIZA_API_PORT ?? process.env.DOOLITTLE_PORT;
  const endpoint = resolveDoolittleApiUrl(args[0], configuredPort);
  const request = createHealthProbeRequest(
    endpoint,
    process.env.ELIZA_API_TOKEN,
    configuredPort,
    process.env.DOOLITTLE_PROBE_AUTH_ORIGIN,
  );
  const response = await fetch(endpoint, {
    ...request,
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
