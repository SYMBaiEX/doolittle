import { startCli } from "@/cli";
import { getAppContext } from "@/runtime/bootstrap";
import { startApiServer } from "@/server";

async function main(): Promise<void> {
  const context = await getAppContext();
  const wantsCli =
    context.config.mode === "cli" || context.config.mode === "both";
  const wantsApi =
    context.config.mode === "api" || context.config.mode === "both";
  const cliFlag = Bun.argv.includes("--cli");
  const plainCliFlag = Bun.argv.includes("--plain-cli");
  const apiOnlyFlag = Bun.argv.includes("--api-only");
  const gatewayFlag = Bun.argv.includes("--gateway");

  if (wantsApi || apiOnlyFlag || gatewayFlag) {
    try {
      startApiServer(context);
      console.log(
        `${context.config.agentName} API listening on http://${context.config.host}:${context.config.port}`,
      );
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "EADDRINUSE" && !apiOnlyFlag && !gatewayFlag) {
        console.warn(
          `API port ${context.config.port} is already in use. Continuing with local CLI only.`,
        );
      } else {
        throw error;
      }
    }
  }

  if (gatewayFlag) {
    await context.gateway.start();
    console.log(`${context.config.agentName} gateway started.`);
  }

  if ((wantsCli && process.stdin.isTTY) || cliFlag || plainCliFlag) {
    await startCli(context);
  } else if (!wantsApi && !apiOnlyFlag) {
    console.log(
      `${context.config.agentName} initialized. Set ELIZA_AGENT_MODE=cli|api|both or use --cli.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
