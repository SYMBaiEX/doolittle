// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { collectSidebarFocusables } from "./desktop-navigation";

describe("shell modal focus targets", () => {
  it("skips CSS-hidden separators and hidden or inert ancestors", () => {
    const panel = document.createElement("aside");
    panel.innerHTML =
      '<button id="close">Close</button><div style="display:none"><hr tabindex="0"></div><div hidden><button>Hidden</button></div><div inert><button>Inert</button></div><div aria-hidden="true"><button>Hidden to accessibility</button></div><button disabled>Disabled</button><hr id="visible" tabindex="0"><button style="visibility:hidden">Invisible</button>';
    document.body.append(panel);
    try {
      expect(
        collectSidebarFocusables(panel).map((element) => element.id),
      ).toEqual(["close", "visible"]);
      panel.style.display = "none";
      expect(collectSidebarFocusables(panel)).toEqual([]);
    } finally {
      panel.remove();
    }
  });
});
