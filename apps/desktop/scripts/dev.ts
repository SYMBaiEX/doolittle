import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function run(command: string, args: string[], env = process.env) {
  return spawn(command, args, {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env,
    stdio: "inherit",
    shell: false,
  });
}

async function waitForRenderer(url: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Renderer did not start at ${url}.`);
}

const build = run("bun", ["run", "build:main"]);
const buildExit = await new Promise<number>((resolve) => {
  build.once("exit", (code) => resolve(code ?? 1));
});

if (buildExit !== 0) {
  process.exit(buildExit);
}

const rendererUrl = "http://127.0.0.1:5173";
const vite = run("bunx", [
  "vite",
  "--config",
  "vite.renderer.config.ts",
  "--host",
  "127.0.0.1",
  "--port",
  "5173",
  "--strictPort",
]);
try {
  await waitForRenderer(rendererUrl);
} catch (error) {
  vite.kill("SIGTERM");
  throw error;
}
const electron = run("bunx", ["electron", "."], {
  ...process.env,
  DOOLITTLE_RENDERER_URL: rendererUrl,
});

const shutdown = () => {
  electron.kill("SIGTERM");
  vite.kill("SIGTERM");
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
electron.once("exit", (code) => {
  vite.kill("SIGTERM");
  process.exit(code ?? 0);
});
