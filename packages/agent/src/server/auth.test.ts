import { describe, expect, it } from "bun:test";
import { isApiRequestAuthorized, isLoopbackHost } from "./auth";

function request(authorization?: string): Request {
  return new Request("http://x/secrets", {
    headers: authorization ? { authorization } : {},
  });
}

describe("isLoopbackHost", () => {
  it("recognizes loopback hosts", () => {
    for (const h of ["127.0.0.1", "localhost", "::1", "127.5.5.5"]) {
      expect(isLoopbackHost(h)).toBe(true);
    }
  });
  it("rejects all-interfaces and LAN hosts", () => {
    for (const h of ["0.0.0.0", "192.168.1.10", "10.0.0.5", "example.com"]) {
      expect(isLoopbackHost(h)).toBe(false);
    }
  });
});

describe("isApiRequestAuthorized", () => {
  it("allows any request on a loopback bind (OS-restricted to local)", () => {
    expect(isApiRequestAuthorized({ host: "127.0.0.1" }, request())).toBe(true);
    expect(isApiRequestAuthorized({ host: "localhost" }, request())).toBe(true);
  });

  it("denies all requests on a non-loopback bind with no token (fail-safe)", () => {
    expect(isApiRequestAuthorized({ host: "0.0.0.0" }, request())).toBe(false);
    expect(
      isApiRequestAuthorized({ host: "0.0.0.0" }, request("Bearer anything")),
    ).toBe(false);
  });

  it("requires a matching bearer token on a non-loopback bind", () => {
    const config = { host: "0.0.0.0", apiToken: "s3cret" };
    expect(isApiRequestAuthorized(config, request("Bearer s3cret"))).toBe(true);
    expect(isApiRequestAuthorized(config, request("Bearer wrong"))).toBe(false);
    expect(isApiRequestAuthorized(config, request())).toBe(false);
    expect(isApiRequestAuthorized(config, request("s3cret"))).toBe(false);
  });
});
