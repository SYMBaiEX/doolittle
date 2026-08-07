#!/usr/bin/env nub

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { listGitTrackedFiles } from "./git-tracked-files";

const MARKDOWN_LINK_PATTERN =
  /!?\[[^\]]*\]\((?<destination><[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/gu;
const URI_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/iu;

function trackedMarkdownFiles(): string[] {
  return listGitTrackedFiles().filter(
    (path) => path.toLowerCase().endsWith(".md") && existsSync(path),
  );
}

function localLinkTarget(destination: string): string | undefined {
  const unwrapped = destination.startsWith("<")
    ? destination.slice(1, -1)
    : destination;
  if (
    !unwrapped ||
    unwrapped.startsWith("#") ||
    unwrapped.startsWith("/") ||
    unwrapped.startsWith("//") ||
    URI_SCHEME_PATTERN.test(unwrapped)
  ) {
    return undefined;
  }
  const target = unwrapped.split(/[?#]/u, 1)[0];
  if (!target) {
    return undefined;
  }
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
}

function main(): void {
  const markdownFiles = trackedMarkdownFiles();
  const failures: string[] = [];
  let checkedLinks = 0;

  for (const file of markdownFiles) {
    const contents = readFileSync(file, "utf8");
    for (const match of contents.matchAll(MARKDOWN_LINK_PATTERN)) {
      const target = localLinkTarget(match.groups?.destination ?? "");
      if (!target) {
        continue;
      }
      checkedLinks += 1;
      if (!existsSync(resolve(dirname(file), target))) {
        const line = contents.slice(0, match.index).split("\n").length;
        failures.push(`${file}:${line} -> ${target}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("Local documentation link check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Local documentation link check passed (${markdownFiles.length} files, ${checkedLinks} links).`,
  );
}

main();
