import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  installUiArtifact,
  loadUiArtifact,
  verifyUiArtifact,
} from "./artifact";
import {
  isAuthorizedExtensionSender,
  resolveUiAssetRequest,
  uiAssetResponse,
} from "./community-view";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(
  tier: "community-static" | "trusted-react" = "community-static",
) {
  const root = mkdtempSync(resolve(tmpdir(), "doolittle-ui-artifact-"));
  roots.push(root);
  const source = resolve(root, "source");
  mkdirSync(source);
  const entry = tier === "community-static" ? "index.html" : "bundle.js";
  const bytes = Buffer.from(
    tier === "community-static"
      ? "<h1>Safe UI</h1>"
      : "export function createRenderer(React, Ui) { return () => null; }",
  );
  writeFileSync(resolve(source, entry), bytes);
  const manifest = {
    kind: "doolittle.ui-plugin",
    manifestVersion: 1,
    id: "test-ui",
    name: "Test UI",
    description: "",
    pluginVersion: "1.0.0",
    trustTier: tier,
    compatibility: { uiHostMajor: 1, uiPackageMajor: 0 },
    entry,
    assets: [
      {
        path: entry,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.byteLength,
      },
    ],
    requestedCapabilities: ["conversation.read", "message.send"],
    contributions: { workspaces: [], panels: [] },
  };
  writeFileSync(resolve(source, "manifest.json"), JSON.stringify(manifest));
  return { root, source, entry, manifest };
}

describe("UI artifact boundary", () => {
  it("copies immutable verified bytes and refuses tampering on later load", () => {
    const { root, source, entry } = fixture();
    const verified = installUiArtifact(resolve(root, "installed"), source);
    expect(verified.assets.get(entry)?.toString()).toContain("Safe UI");
    const installed = resolve(
      root,
      "installed",
      "artifacts",
      "test-ui",
      verified.identity.digest,
    );
    expect(
      loadUiArtifact(resolve(root, "installed"), verified.identity).identity,
    ).toEqual(verified.identity);
    writeFileSync(resolve(installed, entry), "changed");
    expect(() =>
      loadUiArtifact(resolve(root, "installed"), verified.identity),
    ).toThrow(/integrity/u);
  });

  it("rejects symlinks, extras, traversal and undeclared assets", () => {
    const { source, entry, manifest } = fixture();
    writeFileSync(resolve(source, "extra.js"), "not declared");
    expect(() => verifyUiArtifact(source)).toThrow(/exactly match/u);
    rmSync(resolve(source, "extra.js"));
    rmSync(resolve(source, entry));
    symlinkSync(resolve(source, "manifest.json"), resolve(source, entry));
    expect(() => verifyUiArtifact(source)).toThrow(/symlink/u);
    rmSync(resolve(source, entry));
    manifest.entry = "../secret.html";
    writeFileSync(resolve(source, "manifest.json"), JSON.stringify(manifest));
    expect(() => verifyUiArtifact(source)).toThrow();
  });

  it("serves only own-origin listed bytes with restrictive CSP", async () => {
    const { source } = fixture();
    const artifact = verifyUiArtifact(source);
    expect(
      resolveUiAssetRequest("doolittle-ui://test-ui/%2e%2e/secret", artifact),
    ).toBeUndefined();
    expect(
      resolveUiAssetRequest("doolittle-ui://test-ui/../index.html", artifact),
    ).toBeUndefined();
    expect(
      resolveUiAssetRequest(
        "doolittle-ui://test-ui/index.html?token=1",
        artifact,
      ),
    ).toBeUndefined();
    expect(
      resolveUiAssetRequest("doolittle-ui://test-ui\\index.html", artifact),
    ).toBeUndefined();
    expect(
      resolveUiAssetRequest("doolittle-ui://other/index.html", artifact),
    ).toBeUndefined();
    expect(
      resolveUiAssetRequest("doolittle-ui://test-ui/extra.js", artifact),
    ).toBeUndefined();
    const response = uiAssetResponse(
      "doolittle-ui://test-ui/index.html",
      artifact,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "connect-src 'none'",
    );
    expect(await response.text()).toContain("Safe UI");
    expect(
      uiAssetResponse(
        "doolittle-ui://test-ui/index.html",
        artifact,
        "https://evil.test",
      ).status,
    ).toBe(403);
  });

  it("denies IPC from a different sender, subframe, origin, or invalid URL", () => {
    type Contents = Parameters<typeof isAuthorizedExtensionSender>[1];
    type Event = Parameters<typeof isAuthorizedExtensionSender>[0];
    const frame = { url: "doolittle-ui://test-ui/index.html" };
    const contents = { mainFrame: frame } as unknown as Contents;
    const origin = "doolittle-ui://test-ui";
    const event = { sender: contents, senderFrame: frame } as unknown as Event;
    expect(isAuthorizedExtensionSender(event, contents, origin)).toBe(true);
    expect(
      isAuthorizedExtensionSender(
        { ...event, sender: {} as Contents },
        contents,
        origin,
      ),
    ).toBe(false);
    expect(
      isAuthorizedExtensionSender(
        { ...event, senderFrame: { url: frame.url } } as Event,
        contents,
        origin,
      ),
    ).toBe(false);
    expect(
      isAuthorizedExtensionSender(
        { ...event, senderFrame: undefined } as Event,
        contents,
        origin,
      ),
    ).toBe(false);
    frame.url = "https://evil.test";
    expect(isAuthorizedExtensionSender(event, contents, origin)).toBe(false);
    frame.url = "not a url";
    expect(isAuthorizedExtensionSender(event, contents, origin)).toBe(false);
  });

  it("rejects symlinked directories and changed asset digests", () => {
    const { source, entry, manifest } = fixture();
    mkdirSync(resolve(source, "nested"));
    symlinkSync(resolve(source, "nested"), resolve(source, "linked"));
    expect(() => verifyUiArtifact(source)).toThrow(/symlink/u);
    rmSync(resolve(source, "linked"));
    rmSync(resolve(source, "nested"), { recursive: true });
    const declared = manifest.assets[0];
    if (!declared) throw new Error("Fixture asset is missing.");
    writeFileSync(resolve(source, entry), "X".repeat(declared.bytes));
    expect(() => verifyUiArtifact(source)).toThrow(/integrity/u);
    declared.sha256 = "0".repeat(64);
    writeFileSync(resolve(source, "manifest.json"), JSON.stringify(manifest));
    expect(() => verifyUiArtifact(source)).toThrow(/integrity/u);
  });

  it("rejects manifest-listed self overwrite", () => {
    const { source, manifest } = fixture();
    const bytes = readFileSync(resolve(source, "manifest.json"));
    manifest.assets.push({
      path: "manifest.json",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.byteLength,
    });
    writeFileSync(resolve(source, "manifest.json"), JSON.stringify(manifest));
    expect(() => verifyUiArtifact(source)).toThrow(/cannot list itself/u);
  });
});
