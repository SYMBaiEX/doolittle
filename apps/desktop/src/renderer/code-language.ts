export interface CodeLanguage {
  id: string;
  label: string;
}

const FILE_NAME_LANGUAGES = new Map<string, CodeLanguage>([
  ["dockerfile", { id: "dockerfile", label: "Dockerfile" }],
  ["gemfile", { id: "ruby", label: "Ruby" }],
  ["makefile", { id: "plaintext", label: "Makefile" }],
  ["procfile", { id: "shell", label: "Procfile" }],
  ["rakefile", { id: "ruby", label: "Ruby" }],
]);

const EXTENSION_LANGUAGES = new Map<string, CodeLanguage>([
  ["astro", { id: "html", label: "Astro" }],
  ["bash", { id: "shell", label: "Bash" }],
  ["c", { id: "c", label: "C" }],
  ["cc", { id: "cpp", label: "C++" }],
  ["cfg", { id: "ini", label: "Config" }],
  ["clj", { id: "clojure", label: "Clojure" }],
  ["cljs", { id: "clojure", label: "ClojureScript" }],
  ["cmake", { id: "plaintext", label: "CMake" }],
  ["conf", { id: "ini", label: "Config" }],
  ["cpp", { id: "cpp", label: "C++" }],
  ["cs", { id: "csharp", label: "C#" }],
  ["css", { id: "css", label: "CSS" }],
  ["csv", { id: "plaintext", label: "CSV" }],
  ["cxx", { id: "cpp", label: "C++" }],
  ["dart", { id: "dart", label: "Dart" }],
  ["diff", { id: "diff", label: "Diff" }],
  ["env", { id: "ini", label: "Environment" }],
  ["ex", { id: "elixir", label: "Elixir" }],
  ["exs", { id: "elixir", label: "Elixir" }],
  ["fish", { id: "shell", label: "Fish" }],
  ["fs", { id: "fsharp", label: "F#" }],
  ["fsx", { id: "fsharp", label: "F#" }],
  ["go", { id: "go", label: "Go" }],
  ["graphql", { id: "graphql", label: "GraphQL" }],
  ["gql", { id: "graphql", label: "GraphQL" }],
  ["h", { id: "c", label: "C Header" }],
  ["handlebars", { id: "handlebars", label: "Handlebars" }],
  ["hbs", { id: "handlebars", label: "Handlebars" }],
  ["hpp", { id: "cpp", label: "C++ Header" }],
  ["htm", { id: "html", label: "HTML" }],
  ["html", { id: "html", label: "HTML" }],
  ["ini", { id: "ini", label: "INI" }],
  ["java", { id: "java", label: "Java" }],
  ["js", { id: "javascript", label: "JavaScript" }],
  ["json", { id: "json", label: "JSON" }],
  ["json5", { id: "json", label: "JSON5" }],
  ["jsonc", { id: "json", label: "JSON with Comments" }],
  ["jsx", { id: "javascript", label: "JavaScript React" }],
  ["kt", { id: "kotlin", label: "Kotlin" }],
  ["kts", { id: "kotlin", label: "Kotlin Script" }],
  ["less", { id: "less", label: "Less" }],
  ["lua", { id: "lua", label: "Lua" }],
  ["md", { id: "markdown", label: "Markdown" }],
  ["mdx", { id: "markdown", label: "MDX" }],
  ["mjs", { id: "javascript", label: "JavaScript" }],
  ["mm", { id: "objective-c", label: "Objective-C++" }],
  ["pas", { id: "pascal", label: "Pascal" }],
  ["php", { id: "php", label: "PHP" }],
  ["pl", { id: "perl", label: "Perl" }],
  ["properties", { id: "ini", label: "Properties" }],
  ["ps1", { id: "powershell", label: "PowerShell" }],
  ["py", { id: "python", label: "Python" }],
  ["r", { id: "r", label: "R" }],
  ["rb", { id: "ruby", label: "Ruby" }],
  ["rs", { id: "rust", label: "Rust" }],
  ["sass", { id: "scss", label: "Sass" }],
  ["scala", { id: "scala", label: "Scala" }],
  ["scss", { id: "scss", label: "SCSS" }],
  ["sh", { id: "shell", label: "Shell" }],
  ["sol", { id: "sol", label: "Solidity" }],
  ["sql", { id: "sql", label: "SQL" }],
  ["svelte", { id: "html", label: "Svelte" }],
  ["swift", { id: "swift", label: "Swift" }],
  ["tf", { id: "hcl", label: "Terraform" }],
  ["tfvars", { id: "hcl", label: "Terraform Variables" }],
  ["toml", { id: "ini", label: "TOML" }],
  ["ts", { id: "typescript", label: "TypeScript" }],
  ["tsx", { id: "typescript", label: "TypeScript React" }],
  ["txt", { id: "plaintext", label: "Plain Text" }],
  ["vue", { id: "html", label: "Vue" }],
  ["xml", { id: "xml", label: "XML" }],
  ["yaml", { id: "yaml", label: "YAML" }],
  ["yml", { id: "yaml", label: "YAML" }],
  ["zig", { id: "plaintext", label: "Zig" }],
  ["zsh", { id: "shell", label: "Zsh" }],
]);

const FALLBACK_LANGUAGE: CodeLanguage = {
  id: "plaintext",
  label: "Plain Text",
};

export function detectCodeLanguage(path: string): CodeLanguage {
  const name = path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
  const lowerName = name.toLowerCase();
  const named = FILE_NAME_LANGUAGES.get(lowerName);
  if (named) return named;

  if (lowerName.startsWith(".env")) {
    return { id: "ini", label: "Environment" };
  }
  if (lowerName.endsWith(".d.ts")) {
    return { id: "typescript", label: "TypeScript Declaration" };
  }

  const fileExtension = lowerName.includes(".")
    ? (lowerName.split(".").at(-1) ?? "")
    : "";
  return EXTENSION_LANGUAGES.get(fileExtension) ?? FALLBACK_LANGUAGE;
}
