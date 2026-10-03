import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { RENDERED_FACTS_SCRIPT } from "./browser-render-facts";

function fixture(
  overrides: Record<string, unknown> = {},
  options: {
    inactive?: boolean;
    hidden?: boolean;
    ancestorHidden?: boolean;
    occluded?: boolean;
    nested?: boolean;
    pseudo?: boolean;
    image?: boolean;
    truncated?: boolean;
    decorative?: boolean;
    button?: boolean;
    coloredGlyph?: boolean;
    empty?: boolean;
    duplicate?: boolean;
    elementHeavy?: boolean;
    oversizedId?: boolean;
  } = {},
) {
  const rect = {
    width: 100,
    height: 20,
    top: 10,
    left: 10,
    right: 110,
    bottom: 30,
  };
  const node = {
    nodeType: 3,
    textContent: options.coloredGlyph ? "Read 🟢" : "Read the latest",
  };
  const style = {
    display: "block",
    visibility: "visible",
    color: "rgb(24, 45, 57)",
    backgroundColor: "rgb(24, 45, 57)",
    backgroundImage: "none",
    backgroundClip: "border-box",
    opacity: "1",
    filter: "none",
    backdropFilter: "none",
    mixBlendMode: "normal",
    maskImage: "none",
    clipPath: "none",
    transform: "none",
    textShadow: "none",
    webkitTextStrokeWidth: "0px",
    webkitTextFillColor: "rgb(24, 45, 57)",
    pointerEvents: "auto",
    overflowX: "visible",
    overflowY: "visible",
    textDecorationLine: "none",
    fontSize: "14px",
    fontWeight: "500",
    ...overrides,
  };
  const ancestor = {
    parentElement: null,
    inert: false,
    getAttribute: () => null,
  };
  const element = {
    tagName: options.button ? "BUTTON" : "A",
    textContent: node.textContent,
    childNodes: options.empty
      ? []
      : options.nested
        ? [{ nodeType: 1, textContent: node.textContent }]
        : [node],
    parentElement: options.ancestorHidden ? ancestor : null,
    disabled: options.inactive,
    inert: false,
    getBoundingClientRect: () => rect,
    hasAttribute: () => true,
    getAttribute: (name: string) =>
      name === "id" && options.oversizedId
        ? "x".repeat(129)
        : name === "href"
          ? "#stories"
          : name === "aria-hidden" && options.decorative
            ? "true"
            : null,
    matches: () => false,
    contains: () => false,
  };
  const elements = options.elementHeavy
    ? [...Array(5001).fill({ ...element, tagName: "DIV" }), element]
    : options.truncated
      ? Array(5001).fill(element)
      : [element];
  const walked = options.duplicate ? [element, { ...element }] : elements;
  let nextNodeCalls = 0;
  const result = runInNewContext(RENDERED_FACTS_SCRIPT, {
    document: {
      title: "Fixture",
      body: { innerText: "Fixture" },
      images: [],
      documentElement: {},
      createTreeWalker: () => {
        let index = 0;
        return {
          nextNode: () => {
            nextNodeCalls++;
            return walked[index++] ?? null;
          },
        };
      },
      querySelectorAll: (selector: string) =>
        selector === "body *"
          ? elements
          : selector === "a[href]"
            ? [element]
            : [],
      getElementById: () => null,
      createRange: () => ({
        selectNodeContents: () => {},
        getClientRects: () => [rect],
      }),
      elementFromPoint: () => (options.occluded ? {} : element),
    },
    getComputedStyle: (_element: unknown, pseudo?: string) =>
      pseudo
        ? { content: options.pseudo ? '"paint"' : "none" }
        : {
            ...style,
            ...(options.hidden ||
            (options.ancestorHidden && _element === ancestor)
              ? { visibility: "hidden" }
              : {}),
            ...(options.image
              ? { backgroundImage: "linear-gradient(red,blue)" }
              : {}),
          },
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    location: { href: "http://fixture/" },
  });
  return { ...JSON.parse(JSON.stringify(result)), nextNodeCalls };
}

describe("fixed read-only interactive text qualifiers", () => {
  it("qualifies direct text on a confident enabled native control", () => {
    const facts = fixture();
    expect(facts.interactiveTextCandidates[0].interactiveText).toMatchObject({
      controlKind: "link",
      eligibility: "eligible",
    });
    expect(facts.interactiveTextScan).toEqual({
      version: 1,
      complete: true,
      unknown: false,
    });
  });
  it("qualifies an enabled native button", () =>
    expect(
      fixture({}, { button: true }).interactiveTextCandidates[0]
        .interactiveText,
    ).toMatchObject({ controlKind: "button", eligibility: "eligible" }));
  it("keeps colored glyphs outside the computed-RGB sentinel", () =>
    expect(
      fixture({}, { coloredGlyph: true }).interactiveTextScan.unknown,
    ).toBe(true));
  it.each([
    "opacity",
    "filter",
    "backdropFilter",
    "maskImage",
    "clipPath",
    "transform",
    "textShadow",
    "webkitTextStrokeWidth",
    "webkitTextFillColor",
    "mixBlendMode",
    "overflowX",
    "overflowY",
    "textDecorationLine",
  ])("keeps unsupported %s unknown", (field) => {
    const facts = fixture({ [field]: "unsupported" });
    expect(facts.interactiveTextCandidates[0].interactiveText.eligibility).toBe(
      "unknown",
    );
    expect(facts.interactiveTextScan.unknown).toBe(true);
  });
  it.each(["occluded", "nested", "pseudo", "image"])(
    "keeps %s unknown",
    (option) =>
      expect(fixture({}, { [option]: true }).interactiveTextScan.unknown).toBe(
        true,
      ),
  );
  it.each(["inactive", "decorative"])("excludes %s text", (option) =>
    expect(
      fixture({}, { [option]: true }).interactiveTextCandidates[0]
        .interactiveText.eligibility,
    ).toBe("excluded"),
  );
  it("excludes hidden controls from the new sentinel and legacy contrast candidates", () => {
    const facts = fixture({}, { hidden: true });
    expect(facts.contrastCandidates).toHaveLength(0);
    expect(facts.interactiveTextCandidates[0].interactiveText.eligibility).toBe(
      "excluded",
    );
  });
  it("excludes controls with a hidden ancestor even when their own style is visible", () => {
    const facts = fixture({}, { ancestorHidden: true });
    expect(facts.contrastCandidates).toHaveLength(1);
    expect(facts.interactiveTextCandidates[0].interactiveText.eligibility).toBe(
      "excluded",
    );
    expect(facts.interactiveTextScan.unknown).toBe(false);
  });
  it("marks truncated discovery incomplete", () =>
    expect(fixture({}, { truncated: true }).interactiveTextScan.complete).toBe(
      false,
    ));
  it("keeps generated-only text unknown even without DOM text", () => {
    expect(
      fixture({}, { empty: true, pseudo: true }).interactiveTextCandidates[0]
        .interactiveText.eligibility,
    ).toBe("unknown");
  });
  it("does not claim duplicate native identities are unambiguous", () => {
    expect(
      fixture({}, { duplicate: true }).interactiveTextCandidates.every(
        (candidate: { interactiveText: { unambiguous: boolean } }) =>
          !candidate.interactiveText.unambiguous,
      ),
    ).toBe(true);
  });
  it("stops native control discovery at the finite cap", () => {
    const facts = fixture({}, { truncated: true });
    expect(facts.nextNodeCalls).toBe(120);
    expect(facts.interactiveTextCandidates).toHaveLength(120);
    expect(facts.interactiveTextCandidates[0].interactiveText.unambiguous).toBe(
      false,
    );
  });
  it("stops element-heavy discovery without materializing a control selector", () => {
    const facts = fixture({}, { elementHeavy: true });
    expect(facts.nextNodeCalls).toBe(5000);
    expect(facts.interactiveTextCandidates).toHaveLength(0);
    expect(facts.interactiveTextScan.complete).toBe(false);
  });
  it("does not fall back to another identity when an explicit ID exceeds its bound", () => {
    const qualifier = fixture({}, { oversizedId: true })
      .interactiveTextCandidates[0].interactiveText;
    expect(qualifier.subject).toBeNull();
    expect(qualifier.unambiguous).toBe(false);
  });
});
