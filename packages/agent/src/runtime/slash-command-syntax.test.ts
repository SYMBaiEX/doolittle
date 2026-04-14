import { describe, expect, it } from "bun:test";
import {
  canonicalizeSlashCommandSyntax,
  normalizeSlashCommandSyntax,
} from "./slash-command-syntax";

describe("slash command syntax", () => {
  it("canonicalizes two-segment slash commands into hyphenated command names", () => {
    expect(canonicalizeSlashCommandSyntax("/gateway readiness")).toBe(
      "/gateway-readiness",
    );
    expect(canonicalizeSlashCommandSyntax("/gateway readiness now")).toBe(
      "/gateway-readiness now",
    );
    expect(canonicalizeSlashCommandSyntax("plain text")).toBe("plain text");
    expect(canonicalizeSlashCommandSyntax("/gateway")).toBe("/gateway");
  });

  it("keeps invalid slash segments untouched", () => {
    expect(canonicalizeSlashCommandSyntax("/gateway ready?")).toBe(
      "/gateway ready?",
    );
    expect(canonicalizeSlashCommandSyntax("/123 readiness")).toBe(
      "/123 readiness",
    );
  });

  it("normalizes hyphenated slash commands back into tokenized syntax", () => {
    expect(normalizeSlashCommandSyntax("/gateway-readiness")).toBe(
      "/gateway readiness",
    );
    expect(normalizeSlashCommandSyntax("/gateway-readiness now")).toBe(
      "/gateway readiness now",
    );
    expect(normalizeSlashCommandSyntax("/gateway")).toBe("/gateway");
    expect(normalizeSlashCommandSyntax("status")).toBe("status");
  });

  it("leaves malformed hyphenated forms unchanged", () => {
    expect(normalizeSlashCommandSyntax("/gateway--readiness")).toBe(
      "/gateway--readiness",
    );
    expect(normalizeSlashCommandSyntax("/9-readiness")).toBe("/9-readiness");
  });
});
