import { expect, it } from "vitest";
import { parse } from "yaml";
import { productionAuditScopes } from "../../scripts/audit-production";
import { assertNoRuntimeAdvisories } from "../../scripts/check-runtime-advisory-policy";

it("audits workspace production roots when the root package contains only tools", () => {
  const source = `lockfileVersion: '9.0'
importers:
  .:
    devDependencies:
      tool: {specifier: '1', version: '1.0.0'}
  apps/cli:
    dependencies:
      '@fixture/runtime': {specifier: 'workspace:*', version: 'link:../../packages/runtime'}
      shared: {specifier: '1', version: '1.0.0'}
  packages/runtime:
    dependencies:
      model: {specifier: '2', version: '2.0.0'}
      shared: {specifier: '1', version: '1.0.0'}
    optionalDependencies:
      native: {specifier: '3', version: '3.0.0'}
  packages/other:
    dependencies:
      shared: {specifier: '2', version: '2.0.0'}
packages:
  model@2.0.0: {resolution: {integrity: fixture}}
snapshots:
  model@2.0.0: {}
`;
  const scopes = productionAuditScopes(source, [
    "apps/cli",
    "packages/runtime",
    "packages/other",
  ]);
  expect(scopes).toHaveLength(2);
  expect(scopes[0].dependencies).toEqual({
    shared: { specifier: "1", version: "1.0.0" },
    model: { specifier: "2", version: "2.0.0" },
    native: { specifier: "3", version: "3.0.0" },
  });
  expect(scopes[1].dependencies.shared.version).toBe("2.0.0");
  for (const scope of scopes) {
    expect(scope.lockfile.slice(scope.lockfile.indexOf("packages:\n"))).toBe(
      source.slice(source.indexOf("packages:\n")),
    );
    expect(
      parse(scope.lockfile).importers["."].devDependencies,
    ).toBeUndefined();
  }
  expect(() => productionAuditScopes(source, ["missing"])).toThrow(
    "Missing locked workspace",
  );
  expect(() => productionAuditScopes(source, [])).toThrow("empty audit");
});

it.each(["low", "moderate", "high", "critical"])(
  "rejects %s advisories including previously backported packages",
  (severity) => {
    expect(() =>
      assertNoRuntimeAdvisories({
        advisories: {
          finding: {
            severity,
            url: "https://github.com/advisories/GHSA-3gc7-fjrx-p6mg",
          },
        },
      }),
    ).toThrow("advisories must be resolved");
  },
);

it("accepts a clean inventory and fails closed on invalid reports", () => {
  expect(() => assertNoRuntimeAdvisories({ advisories: {} })).not.toThrow();
  expect(() => assertNoRuntimeAdvisories({})).toThrow(
    "valid advisory inventory",
  );
  expect(() =>
    assertNoRuntimeAdvisories({ error: "registry failed", advisories: {} }),
  ).toThrow("valid advisory inventory");
});
