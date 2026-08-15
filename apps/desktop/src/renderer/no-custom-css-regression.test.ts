import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rendererRoot = new URL("./", import.meta.url);

const cssInfrastructure = ["eliza-tailwind.css"] as const;

function cssFiles(url: URL, prefix = ""): string[] {
  return readdirSync(url, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return cssFiles(new URL(`${entry.name}/`, url), relative);
    }
    return entry.isFile() && entry.name.endsWith(".css") ? [relative] : [];
  });
}

describe("Tailwind-only renderer migration", () => {
  it("does not introduce another handwritten stylesheet", () => {
    expect(cssFiles(rendererRoot).sort()).toEqual(
      [...cssInfrastructure].sort(),
    );
  });

  it("keeps the Tailwind entry free of custom CSS authoring directives", () => {
    const source = readFileSync(
      new URL("./eliza-tailwind.css", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/@(apply|theme|utility)\b/u);
  });
});
