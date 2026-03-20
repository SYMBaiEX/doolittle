import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class WebService {
  constructor(private readonly outputDir = ".eliza-agent/web") {
    mkdirSync(this.outputDir, { recursive: true });
  }

  async fetchText(url: string): Promise<{
    url: string;
    title?: string;
    text: string;
  }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Web fetch failed (${response.status}): ${await response.text()}`);
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/isu);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<[^>]+>/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();

    return {
      url,
      title: titleMatch?.[1]?.trim(),
      text: text.slice(0, 20_000),
    };
  }

  async snapshot(url: string): Promise<string> {
    const page = await this.fetchText(url);
    const filePath = join(this.outputDir, `snapshot-${Date.now()}.md`);
    const content = [
      `# ${page.title ?? page.url}`,
      "",
      `Source: ${page.url}`,
      "",
      page.text,
    ].join("\n");
    writeFileSync(filePath, content, "utf8");
    return filePath;
  }
}
