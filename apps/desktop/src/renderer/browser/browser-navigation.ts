export type BrowserPreviewSize = "responsive" | "desktop" | "tablet" | "mobile";

export interface BrowserNavigationState {
  address: string;
  currentUrl: string;
  history: string[];
  historyIndex: number;
}

export type BrowserNavigationAction =
  | { type: "edit-address"; address: string }
  | { type: "show-url"; url: string; recordHistory?: boolean }
  | { type: "travel"; direction: -1 | 1 }
  | { type: "clear-preview" };

export const INITIAL_BROWSER_NAVIGATION: BrowserNavigationState = {
  address: "http://127.0.0.1:3000",
  currentUrl: "",
  history: [],
  historyIndex: -1,
};

export function normalizeBrowserUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new Error("Enter a URL to preview.");
  const hasControlCharacter = Array.from(input).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
  if (input.length > 4096 || hasControlCharacter) {
    throw new Error("Enter a valid URL shorter than 4,096 characters.");
  }
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//iu.test(input)
    ? input
    : `http://${input}`;
  const parsed = new URL(withProtocol);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS pages can be previewed.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials cannot be previewed.");
  }
  return parsed.toString();
}

export function isLocalPreviewUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export function browserNavigationReducer(
  state: BrowserNavigationState,
  action: BrowserNavigationAction,
): BrowserNavigationState {
  if (action.type === "edit-address") {
    return { ...state, address: action.address };
  }
  if (action.type === "clear-preview") {
    return { ...state, currentUrl: "" };
  }
  if (action.type === "travel") {
    const historyIndex = state.historyIndex + action.direction;
    const url = state.history[historyIndex];
    if (!url) return state;
    return { ...state, address: url, currentUrl: url, historyIndex };
  }

  if (!action.recordHistory) {
    return { ...state, address: action.url, currentUrl: action.url };
  }
  const prior = state.history.slice(0, state.historyIndex + 1);
  if (prior.at(-1) === action.url) {
    return { ...state, address: action.url, currentUrl: action.url };
  }
  const history = [...prior, action.url].slice(-25);
  return {
    address: action.url,
    currentUrl: action.url,
    history,
    historyIndex: history.length - 1,
  };
}
