import { startCli } from "@/cli";
import { getAppContext } from "@/runtime/bootstrap";
import { startApiServer } from "@/server";

async function main(): Promise<void> {
  const context = await getAppContext();
  const wantsCli = context.config.mode === "cli" || context.config.mode === "both";
  const wantsApi = context.config.mode === "api" || context.config.mode === "both";
  const cliFlag = Bun.argv.includes("--cli");
  const apiOnlyFlag = Bun.argv.includes("--api-only");
  const gatewayFlag = Bun.argv.includes("--gateway");

  if (wantsApi || apiOnlyFlag || gatewayFlag) {
    startApiServer(context);
    console.log(
      `${context.config.agentName} API listening on http://${context.config.host}:${context.config.port}`,
    );
  }

  if (gatewayFlag) {
    await context.gateway.start();
    console.log(`${context.config.agentName} gateway started.`);
  }

  if ((wantsCli && process.stdin.isTTY) || cliFlag) {
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
