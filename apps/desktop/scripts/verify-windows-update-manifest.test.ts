import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  verifyWindowsUpdatePublisher,
  windowsUpdatePublisherNames,
} from "./verify-windows-update-manifest";

describe("Windows update manifest publisher verification", () => {
  it("reads electron-builder's publisherName array", () => {
    expect(
      windowsUpdatePublisherNames(
        "provider: github\npublisherName:\n  - 'CN=SYMBaiEX, O=SYMBaiEX'\n",
      ),
    ).toEqual(["CN=SYMBaiEX, O=SYMBaiEX"]);
  });

  it("requires one exact signed publisher subject", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-update-"));
    const manifest = resolve(directory, "app-update.yml");
    try {
      writeFileSync(
        manifest,
        "publisherName:\n  - 'CN=SYMBaiEX, O=SYMBaiEX'\n",
      );
      expect(() =>
        verifyWindowsUpdatePublisher(manifest, "CN=SYMBaiEX, O=SYMBaiEX"),
      ).not.toThrow();
      expect(() =>
        verifyWindowsUpdatePublisher(manifest, "CN=Someone Else"),
      ).toThrow(
        "app-update.yml publisherName does not match the Authenticode signer subject",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects scalar, empty, and ambiguous publisher metadata", () => {
    expect(() =>
      windowsUpdatePublisherNames("publisherName: CN=SYMBaiEX\n"),
    ).toThrow("must contain a publisherName array");
    expect(() => windowsUpdatePublisherNames("publisherName: []\n")).toThrow(
      "exactly one publisherName",
    );
    expect(() =>
      windowsUpdatePublisherNames(
        "publisherName:\n  - CN=SYMBaiEX\n  - CN=Someone Else\n",
      ),
    ).toThrow("exactly one publisherName");
  });
});
