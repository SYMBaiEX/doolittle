// The desktop engine child, its named isolates, and the private knowledge
// broker share this entrypoint. Interactive CLI dispatch has its own entry.
if (process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1") {
  console.error("The managed runtime must be launched by Doolittle Desktop.");
  process.exit(1);
}

const keepAlive = setInterval(() => {}, 60_000);

try {
  // Capture launch authority before evaluating runtime or configuration code.
  await import("./entrypoint/host-execution");
  const [{ getEntrypointLogger }, { runEntrypointRuntime }] = await Promise.all(
    [
      import("@doolittle/agent/logging/entrypoint-logger"),
      import("./entrypoint/runtime-command"),
    ],
  );
  process.exitCode = await runEntrypointRuntime(
    { command: "api", rest: [], shellIsInteractive: false },
    getEntrypointLogger("managed-runtime"),
    import.meta.url,
  );
} catch (error) {
  const { getEntrypointLogger } = await import(
    "@doolittle/agent/logging/entrypoint-logger"
  );
  getEntrypointLogger("managed-runtime").captureError("startup-failed", error);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  clearInterval(keepAlive);
}
