import { describe, expect, test } from "vitest";
import { views } from "../desktop-navigation";
import { DESKTOP_ROUTE_PRELOADERS } from "./DesktopRouteContent";

describe("desktop route preloaders", () => {
  test("covers every application route", () => {
    expect(new Set(Object.keys(DESKTOP_ROUTE_PRELOADERS))).toEqual(views);
    for (const preloader of Object.values(DESKTOP_ROUTE_PRELOADERS)) {
      expect(preloader).toBeTypeOf("function");
    }
  });
});
