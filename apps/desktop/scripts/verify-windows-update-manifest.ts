import { readFileSync } from "node:fs";
import { parse } from "yaml";

type WindowsUpdateManifest = {
  publisherName?: unknown;
};

export function windowsUpdatePublisherNames(source: string): string[] {
  const manifest = parse(source) as WindowsUpdateManifest | null;
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Windows app-update.yml must contain a YAML mapping.");
  }
  if (!Array.isArray(manifest.publisherName)) {
    throw new Error(
      "Windows app-update.yml must contain a publisherName array.",
    );
  }
  const names = manifest.publisherName.map((value) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(
        "Windows app-update.yml publisherName entries must be non-empty strings.",
      );
    }
    return value.trim();
  });
  if (names.length !== 1) {
    throw new Error(
      `Windows app-update.yml must contain exactly one publisherName; found ${names.length}.`,
    );
  }
  return names;
}

export function verifyWindowsUpdatePublisher(
  manifestPath: string,
  expectedPublisher: string,
): void {
  const expected = expectedPublisher.trim();
  if (!expected) throw new Error("Expected Windows publisher name is empty.");
  const [actual] = windowsUpdatePublisherNames(
    readFileSync(manifestPath, "utf8"),
  );
  if (actual !== expected) {
    throw new Error(
      "app-update.yml publisherName does not match the Authenticode signer subject.",
    );
  }
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.main) {
  const manifestPath = option("--manifest");
  const expectedPublisher = option("--expected-publisher");
  if (!manifestPath || !expectedPublisher) {
    throw new Error(
      "Usage: verify-windows-update-manifest.ts --manifest <path> --expected-publisher <subject DN>",
    );
  }
  verifyWindowsUpdatePublisher(manifestPath, expectedPublisher);
  console.log(
    "Windows update publisher metadata matches the signed application.",
  );
}
