import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";

export async function startCli(context: AppContext): Promise<void> {
  const rl = createInterface({ input, output });
  let closed = false;

  rl.on("close", () => {
    closed = true;
  });

  output.write(`${context.config.agentName} CLI\n`);
  output.write('Type "exit" to quit. Try /status, /doctor, /setup checklist, /model status, /execution status, /tools list, /delegate list, /runtime status, /skills list, /memory list memory, /workspace tree, /workspace read <path>, /terminal run <command>, /repo status, /personality list, /context files, /pdf extract <path>, /gateway status, or /pairing pending.\n\n');

  while (true) {
    let line = "";

    try {
      line = (await rl.question("> ")).trim();
    } catch (error) {
      if (
        closed ||
        (error instanceof Error &&
          "code" in error &&
          error.code === "ERR_USE_AFTER_CLOSE")
      ) {
        break;
      }
      throw error;
    }

    if (!line) {
      continue;
    }
    if (line === "exit" || line === "quit") {
      break;
    }

    try {
      if (line === "/gateway start") {
        await context.gateway.start();
        output.write("\nGateway started.\n\n");
        continue;
      }
      if (line === "/gateway stop") {
        await context.gateway.stop();
        output.write("\nGateway stopped.\n\n");
        continue;
      }
      if (line === "/gateway status") {
        const health = await context.gateway.health();
        output.write(`\n${JSON.stringify(health, null, 2)}\n\n`);
        continue;
      }
      if (line === "/runtime status") {
        output.write(
          `\n${JSON.stringify(
            {
              provider: context.services.settings.get().model.provider,
              model: context.services.settings.get().model.model,
              plugins: {
                openai: Boolean(context.config.openAiApiKey),
                anthropic: Boolean(context.config.anthropicApiKey),
                pdf: true,
                telegram: Boolean(context.config.telegramBotToken),
              },
            },
            null,
            2,
          )}\n\n`,
        );
        continue;
      }
      if (line === "/gateway config") {
        output.write(`\n${JSON.stringify(context.services.gatewayConfig, null, 2)}\n\n`);
        continue;
      }
      if (line.startsWith("/pdf extract ")) {
        const path = line.replace("/pdf extract ", "").trim();
        if (!path) {
          output.write("\nUsage: /pdf extract <path>\n\n");
          continue;
        }
        const text = await context.services.documents.extractPdfFromPath(path);
        output.write(`\n${text}\n\n`);
        continue;
      }
      if (line.startsWith("/gateway receive ")) {
        const payload = line.replace("/gateway receive ", "");
        const [head, text] = payload.split("::").map((part) => part.trim());
        const [platform, userId, roomId] = head.split(/\s+/u);
        if (!platform || !userId || !roomId || !text) {
          output.write(
            "\nUsage: /gateway receive <platform> <userId> <roomId> :: <message>\n\n",
          );
          continue;
        }
        const result = await context.gateway.receive({
          platform: platform as never,
          userId,
          roomId,
          text,
        });
        output.write(`\n${JSON.stringify(result, null, 2)}\n\n`);
        continue;
      }
      if (line === "/pairing pending") {
        output.write(
          `\n${JSON.stringify(context.services.pairing.listPending(), null, 2)}\n\n`,
        );
        continue;
      }
      if (line.startsWith("/pairing approve ")) {
        const [, , platform, code] = line.split(/\s+/u);
        const approved = context.services.pairing.approve(platform as never, code);
        output.write(`\n${JSON.stringify(approved, null, 2)}\n\n`);
        continue;
      }
      if (line.startsWith("/pairing deny ")) {
        const [, , platform, code] = line.split(/\s+/u);
        const denied = context.services.pairing.deny(platform as never, code);
        output.write(`\n${JSON.stringify(denied, null, 2)}\n\n`);
        continue;
      }
      if (line === "/hooks list") {
        output.write(`\n${JSON.stringify(context.services.hooks.list(), null, 2)}\n\n`);
        continue;
      }
      if (line.startsWith("/hooks add ")) {
        const payload = line.replace("/hooks add ", "");
        const [head, template] = payload.split("::").map((part) => part.trim());
        const [event, ...nameParts] = head.split(/\s+/u);
        const name = nameParts.join(" ") || event;
        if (!event || !template) {
          output.write("\nUsage: /hooks add <event> <name?> :: <template>\n\n");
          continue;
        }
        const hook = context.services.hooks.add({
          event,
          name,
          enabled: true,
          template,
        });
        output.write(`\n${JSON.stringify(hook, null, 2)}\n\n`);
        continue;
      }
      if (line === "/hooks recent") {
        output.write(
          `\n${JSON.stringify(context.services.hooks.recentInvocations(), null, 2)}\n\n`,
        );
        continue;
      }
      if (line === "/sessions gateway") {
        output.write(
          `\n${JSON.stringify(context.services.gatewaySessions.list(), null, 2)}\n\n`,
        );
        continue;
      }

      const response = await handleAgentTurn(
        {
          message: line,
          userId: "local-user",
          roomId: "cli:local-user",
          source: "cli",
        },
        context,
      );
      output.write(`\n${response}\n\n`);
    } catch (error) {
      output.write(`\nError: ${error instanceof Error ? error.message : String(error)}\n\n`);
    }
  }

  if (!closed) {
    rl.close();
  }
}
