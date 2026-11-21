import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { LanguageInput, ThemeRegistration } from "shiki/types";

const grammarLoaders: Record<
  string,
  () => Promise<{ default: LanguageInput }>
> = {
  bash: () => import("@shikijs/langs/bash"),
  css: () => import("@shikijs/langs/css"),
  go: () => import("@shikijs/langs/go"),
  html: () => import("@shikijs/langs/html"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  sql: () => import("@shikijs/langs/sql"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  yaml: () => import("@shikijs/langs/yaml"),
};

// The colors are token identifiers. The conversation theme owns the actual
// palette so existing code blocks recolor without retokenizing on theme changes.
const roles = {
  comment: "#111111",
  keyword: "#222222",
  literal: "#333333",
  string: "#444444",
  symbol: "#555555",
};
type TokenRole = keyof typeof roles;
const byColor = new Map(
  Object.entries(roles).map(([role, color]) => [color, role as TokenRole]),
);
const theme: ThemeRegistration = {
  name: "doolittle-chat",
  type: "dark",
  settings: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: roles.comment },
    },
    { scope: ["keyword", "storage"], settings: { foreground: roles.keyword } },
    {
      scope: ["constant", "variable.language"],
      settings: { foreground: roles.literal },
    },
    {
      scope: ["string", "markup.inline.raw"],
      settings: { foreground: roles.string },
    },
    {
      scope: ["entity.name", "support.type", "support.function"],
      settings: { foreground: roles.symbol },
    },
  ],
};

export interface CodeToken {
  text: string;
  role?: TokenRole;
}

let engine: ReturnType<typeof createHighlighterCore> | undefined;
const loadingGrammars = new Map<string, Promise<void>>();

export async function highlightMessageCode(
  code: string,
  language: string,
): Promise<CodeToken[][] | undefined> {
  if (!Object.hasOwn(grammarLoaders, language)) return undefined;
  const loader = grammarLoaders[language];
  if (!loader) return undefined;
  engine ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine({ forgiving: true }),
    langs: [],
    themes: [theme],
  });
  const highlighter = await engine;
  let loading = loadingGrammars.get(language);
  if (!loading) {
    loading = loader().then(({ default: grammar }) =>
      highlighter.loadLanguage(grammar),
    );
    loadingGrammars.set(language, loading);
  }
  await loading;
  // The caller renders tokens as React text nodes rather than injected HTML.
  return highlighter
    .codeToTokensBase(code, { lang: language, theme: theme.name })
    .map((line) =>
      line.map(({ content: text, color }) => ({
        text,
        role: byColor.get(color ?? ""),
      })),
    );
}
