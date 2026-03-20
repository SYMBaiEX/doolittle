import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface BrowserConfig {
  provider: "lightpanda" | "basic";
  command: string;
  cdpUrl?: string;
  obeyRobots: boolean;
}

interface BrowserStatus {
  provider: "lightpanda" | "basic";
  ready: boolean;
  mode: "browser" | "fallback";
  detail: string;
  command?: string;
  cdpUrl?: string;
  artifacts: {
    snapshot: boolean;
    screenshot: boolean;
  };
}

interface WebPageSnapshot {
  url: string;
  title?: string;
  text: string;
  provider: "lightpanda" | "basic";
  mode: "browser" | "fallback";
  renderedAt: string;
}

async function runCommand(
  cmd: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn({
    cmd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(() => clearTimeout(timer));

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function commandExists(binary: string): Promise<boolean> {
  const result = await runCommand(
    ["/bin/zsh", "-lc", `command -v '${binary.replaceAll("'", "'\\''")}'`],
    5_000,
  ).catch(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "",
  }));
  return result.exitCode === 0;
}

function extractReadableText(html: string): { title?: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/isu);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return {
    title: titleMatch?.[1]?.trim(),
    text: text.slice(0, 20_000),
  };
}

function writeArtifact(
  outputDir: string,
  prefix: "snapshot" | "screenshot",
  page: WebPageSnapshot,
  notes: string[],
): string {
  const filePath = join(outputDir, `${prefix}-${Date.now()}.md`);
  const content = [
    `# ${prefix === "screenshot" ? "Browser Screenshot" : page.title ?? page.url}`,
    "",
    `Source: ${page.url}`,
    `Provider: ${page.provider}`,
    `Mode: ${page.mode}`,
    `Rendered at: ${page.renderedAt}`,
    "",
    ...notes,
    "",
    page.text,
  ].join("\n");
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

export class WebService {
  constructor(
    private readonly getConfig: () => BrowserConfig,
    private readonly outputDir = ".eliza-agent/web",
  ) {
    mkdirSync(this.outputDir, { recursive: true });
  }

  async status(): Promise<BrowserStatus> {
    const config = this.getConfig();
    if (config.provider === "basic") {
      return {
        provider: "basic",
        ready: true,
        mode: "fallback",
        detail: "Basic HTTP fetch mode is active.",
        artifacts: {
          snapshot: true,
          screenshot: true,
        },
      };
    }

    const available = await commandExists(config.command);
    return {
      provider: "lightpanda",
      ready: available,
      mode: available ? "browser" : "fallback",
      detail: available
        ? "Lightpanda is available for browser-backed fetch, snapshot, and screenshot artifacts."
        : "Lightpanda is configured as the default browser provider, but the command is not available locally. Falling back to basic HTTP fetch mode.",
      command: config.command,
      cdpUrl: config.cdpUrl,
      artifacts: {
        snapshot: true,
        screenshot: true,
      },
    };
  }

  async fetchText(url: string): Promise<WebPageSnapshot> {
    const config = this.getConfig();
    if (config.provider === "lightpanda" && (await commandExists(config.command))) {
      try {
        const html = await this.fetchWithLightpanda(url, config);
        const readable = extractReadableText(html);
        return {
          url,
          ...readable,
          provider: "lightpanda",
          mode: "browser",
          renderedAt: new Date().toISOString(),
        };
      } catch {
        // Fall through to basic fetch when browser execution is unavailable.
      }
    }

    const html = await this.fetchWithBasic(url);
    const readable = extractReadableText(html);
    return {
      url,
      ...readable,
      provider: config.provider,
      mode: "fallback",
      renderedAt: new Date().toISOString(),
    };
  }

  async snapshot(url: string): Promise<string> {
    const page = await this.fetchText(url);
    return writeArtifact(
      this.outputDir,
      "snapshot",
      page,
      [
        "This artifact captures readable text extracted from the page.",
        "It is suitable for search, diffing, and long-form analysis.",
      ],
    );
  }

  async screenshot(url: string): Promise<string> {
    const page = await this.fetchText(url);
    return writeArtifact(
      this.outputDir,
      "screenshot",
      page,
      [
        "This is a lightweight screenshot artifact placeholder.",
        "When a pixel-level browser capture is available, this file can be replaced with a real image artifact.",
      ],
    );
  }

  private async fetchWithBasic(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Web fetch failed (${response.status}): ${await response.text()}`);
    }
    return response.text();
  }

  private async fetchWithLightpanda(url: string, config: BrowserConfig): Promise<string> {
    const args = [
      config.command,
      "fetch",
      ...(config.obeyRobots ? ["--obey_robots"] : []),
      url,
    ];

    const result = await runCommand(args, 20_000);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Lightpanda fetch failed with exit code ${result.exitCode}.`);
    }

    return result.stdout;
  }
}
