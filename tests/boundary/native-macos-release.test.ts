import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  releaseConfig,
  releasePlist,
} from "../../scripts/package-native-macos-release";

const validFeed = "https://updates.example.org/arm64/appcast.xml";
const validPublicKey = Buffer.alloc(32, 7).toString("base64");
const env = {
  DOOLITTLE_MAC_SIGN_IDENTITY:
    "Developer ID Application: Doolittle (3VZKJ253J2)",
  DOOLITTLE_MAC_NOTARY_PROFILE: "test",
  DOOLITTLE_MAC_UPDATE_FEED: validFeed,
  DOOLITTLE_MAC_UPDATE_PUBLIC_KEY: validPublicKey,
};

it("does not let a release use an ad-hoc identity or skip notarization", () => {
  expect(() => releaseConfig({})).toThrow("DOOLITTLE_MAC_SIGN_IDENTITY");
  expect(() =>
    releaseConfig({ ...env, DOOLITTLE_MAC_SIGN_IDENTITY: "-" }),
  ).toThrow("Developer ID Application certificate");
  expect(() =>
    releaseConfig({ ...env, DOOLITTLE_MAC_NOTARY_PROFILE: undefined }),
  ).toThrow("DOOLITTLE_MAC_NOTARY_PROFILE");
});

it("rejects unsafe update endpoints and invalid signing keys", () => {
  for (const feed of [
    "http://updates.example.org/appcast.xml",
    "https:updates.example.org",
    "https://user:password@updates.example.org/appcast.xml",
    "https://updates.example.org/appcast.xml#",
    "https://updates.example.org/appcast.xml\n",
  ]) {
    expect(() =>
      releaseConfig({ ...env, DOOLITTLE_MAC_UPDATE_FEED: feed }),
    ).toThrow("HTTPS URL");
  }
  expect(() =>
    releaseConfig({
      ...env,
      DOOLITTLE_MAC_UPDATE_PUBLIC_KEY: validPublicKey.trimEnd().slice(0, -1),
    }),
  ).toThrow("Base64 Ed25519 public key");
});

it("rejects a substituted framework before it can be extracted", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-release-test-"));
  try {
    const fakeArchive = join(root, "Sparkle-2.10.1.tar.xz");
    writeFileSync(fakeArchive, "substituted download");
    expect(() =>
      releaseConfig({ ...env, DOOLITTLE_SPARKLE_ARCHIVE: fakeArchive }),
    ).toThrow("pinned 2.10.1 release checksum");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("writes a signed-feed policy without automatic installation", () => {
  const plist = releasePlist({
    archive: Buffer.alloc(0),
    identity: "not-in-plist",
    notaryProfile: "not-in-plist",
    feed: `${validFeed}?platform=mac&arch=arm64`,
    publicKey: validPublicKey,
  });
  expect(plist).toContain("platform=mac&amp;arch=arm64");
  expect(plist).toContain("<key>SURequireSignedFeed</key><true/>");
  expect(plist).toContain("<key>SUVerifyUpdateBeforeExtraction</key><true/>");
  expect(plist).toContain(
    "<key>SUSignedFeedFailureExpirationInterval</key><integer>0</integer>",
  );
  expect(plist).toContain("<key>SUAllowsAutomaticUpdates</key><false/>");
  expect(plist).not.toContain("not-in-plist");
});
