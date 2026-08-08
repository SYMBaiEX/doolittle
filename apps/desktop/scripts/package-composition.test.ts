import { describe, expect, it } from "vitest";
import {
  assertPackageComposition,
  packageNamesFromAsarEntries,
  productionDependencyClosure,
} from "./package-composition";

describe("desktop package composition policy", () => {
  it("finds direct and scoped modules in an app.asar listing", () => {
    expect(
      packageNamesFromAsarEntries([
        "/main.cjs",
        "/node_modules/electron-updater/out/main.js",
        "/node_modules/@scope/runtime/index.js",
        "/node_modules/electron-updater/node_modules/nested/index.js",
      ]),
    ).toEqual(["@scope/runtime", "electron-updater", "nested"]);
  });

  it("walks the recursive production dependency closure", () => {
    expect(
      productionDependencyClosure(
        { "electron-updater": "^6" },
        new Map([
          [
            "electron-updater",
            { dependencies: { "builder-util-runtime": "^9" } },
          ],
          [
            "builder-util-runtime",
            { optionalDependencies: { "fs-extra": "^11" } },
          ],
          ["fs-extra", undefined],
        ]),
      ),
    ).toEqual(["builder-util-runtime", "electron-updater", "fs-extra"]);
  });

  it("rejects an oversized archive and modules outside the production closure", () => {
    expect(() =>
      assertPackageComposition({
        asarBytes: 129,
        maxAsarBytes: 128,
        packagedModules: ["electron-updater", "react"],
        allowedModules: ["electron-updater"],
      }),
    ).toThrow("app.asar is");
    expect(() =>
      assertPackageComposition({
        asarBytes: 128,
        maxAsarBytes: 128,
        packagedModules: ["electron-updater", "react"],
        allowedModules: ["electron-updater"],
      }),
    ).toThrow("react");
  });
});
