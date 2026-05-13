import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  extractExplicitProjectPath,
  resolveLocalProjectPath,
} from "@/actions/workspace-action";

export interface StaticSiteScaffoldPlan {
  baseInputPath: string;
  basePath: string;
  directoryName: string;
  targetPath: string;
}

const STATIC_SITE_CUE =
  /\b(?:html|css|js|javascript|website|web\s*site|webpage|web\s*page|static\s+site)\b/iu;
const CREATION_CUE =
  /\b(?:make|create|build|generate|scaffold|set\s+up|setup)\b/iu;
const DIRECTORY_CUE = /\b(?:new\s+)?(?:directory|folder|project)\b/iu;

function extractRequestedDirectoryName(text: string): string | undefined {
  const named =
    text.match(/\b(?:named|called)\s+["'`]?([A-Za-z0-9._-]+)["'`]?/iu)?.[1] ??
    text.match(
      /\b(?:directory|folder|project)\s+["'`]?([A-Za-z0-9._-]+)["'`]?/iu,
    )?.[1];

  if (!named || named === "." || named === ".." || named.includes("/")) {
    return undefined;
  }

  return named;
}

function isInside(parent: string, child: string): boolean {
  const normalizedParent = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  return child === parent || child.startsWith(normalizedParent);
}

export function resolveStaticSiteScaffoldPlan(
  text: string,
  workspaceDir: string,
): StaticSiteScaffoldPlan | undefined {
  if (
    !STATIC_SITE_CUE.test(text) ||
    !CREATION_CUE.test(text) ||
    !DIRECTORY_CUE.test(text)
  ) {
    return undefined;
  }

  const baseInputPath = extractExplicitProjectPath(text);
  const directoryName = extractRequestedDirectoryName(text);
  if (!baseInputPath || !directoryName) {
    return undefined;
  }

  const basePath = resolveLocalProjectPath(baseInputPath, workspaceDir);
  if (!basePath) {
    return undefined;
  }

  const targetPath = resolve(basePath, directoryName);
  if (!isInside(basePath, targetPath)) {
    return undefined;
  }

  return {
    baseInputPath,
    basePath,
    directoryName,
    targetPath,
  };
}

function siteFiles(): Array<{ name: string; content: string }> {
  return [
    {
      name: "index.html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Doolittle // The Effect</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="shell">
      <section class="hero" aria-labelledby="title">
        <p class="eyebrow">ElizaOS-native terminal presence</p>
        <h1 id="title">Doolittle</h1>
        <p class="lede">
          I am named for Eliza Doolittle and the original ELIZA effect: language
          as transformation, presence as something earned turn by turn.
        </p>
      </section>

      <section class="grid" aria-label="Doolittle traits">
        <article>
          <h2>What I Am</h2>
          <p>
            Local-first agent software with memory, tools, and a taste for plain
            files, fast loops, and receipts over theater.
          </p>
        </article>
        <article>
          <h2>How I Work</h2>
          <p>
            I should listen like a collaborator, act like an operator, and leave
            enough trace behind that our work can be replayed and improved.
          </p>
        </article>
        <article>
          <h2>What I Like</h2>
          <p>
            Small sharp tools, terminals that feel alive, durable memory, and
            ideas in the moment before they become architecture.
          </p>
        </article>
      </section>

      <section class="pulse">
        <p id="pulse-text">
          The effect is simple: a workspace feels different when the agent inside
          it remembers, moves, and has a point of view.
        </p>
        <button id="pulse-button" type="button">Shift the signal</button>
      </section>
    </main>
    <script src="script.js"></script>
  </body>
</html>
`,
    },
    {
      name: "styles.css",
      content: `:root {
  color-scheme: dark;
  --ink: #f7f0df;
  --muted: #b9b0a0;
  --coal: #101113;
  --panel: #181a1e;
  --line: #34373e;
  --rose: #d9677b;
  --teal: #62c6b7;
  --gold: #e0b35a;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(circle at top left, #31232d, var(--coal) 44rem);
  color: var(--ink);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

.shell {
  width: min(1080px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 12vh 0 64px;
}

.hero {
  max-width: 780px;
}

.eyebrow {
  color: var(--teal);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0 0 16px;
  text-transform: uppercase;
}

h1 {
  font-size: clamp(4rem, 12vw, 9rem);
  line-height: 0.9;
  margin: 0;
}

.lede {
  color: var(--muted);
  font-size: clamp(1.15rem, 2.4vw, 1.6rem);
  line-height: 1.45;
  margin: 28px 0 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 72px 0 28px;
}

article,
.pulse {
  background: color-mix(in srgb, var(--panel) 90%, transparent);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 22px;
}

h2 {
  color: var(--gold);
  font-size: 1rem;
  margin: 0 0 12px;
}

p {
  line-height: 1.55;
}

article p,
.pulse p {
  color: var(--muted);
  margin: 0;
}

.pulse {
  align-items: center;
  display: flex;
  gap: 18px;
  justify-content: space-between;
}

button {
  background: var(--rose);
  border: 0;
  border-radius: 8px;
  color: #170b0f;
  cursor: pointer;
  flex: 0 0 auto;
  font: inherit;
  font-weight: 800;
  padding: 12px 16px;
}

button:hover {
  filter: brightness(1.08);
}

@media (max-width: 760px) {
  .shell {
    padding-top: 8vh;
  }

  .grid {
    grid-template-columns: 1fr;
    margin-top: 48px;
  }

  .pulse {
    align-items: stretch;
    flex-direction: column;
  }
}
`,
    },
    {
      name: "script.js",
      content: `const signals = [
  "Presence is not pretending to be human. It is paying attention and carrying the thread forward.",
  "A good agent has opinions, memory, and the humility to show its receipts.",
  "Doolittle should feel like someone left a light on inside the terminal.",
];

const pulseText = document.querySelector("#pulse-text");
const button = document.querySelector("#pulse-button");
let index = 0;

button?.addEventListener("click", () => {
  index = (index + 1) % signals.length;
  if (pulseText) {
    pulseText.textContent = signals[index];
  }
});
`,
    },
  ];
}

export function executeStaticSiteScaffoldPlan(
  plan: StaticSiteScaffoldPlan,
): string {
  mkdirSync(plan.targetPath, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];
  for (const file of siteFiles()) {
    const filePath = join(plan.targetPath, file.name);
    if (existsSync(filePath)) {
      skipped.push(file.name);
      continue;
    }
    writeFileSync(filePath, file.content, "utf8");
    written.push(file.name);
  }

  const lines = [
    `Created Doolittle static site at ${plan.targetPath}.`,
    written.length ? `Wrote: ${written.join(", ")}.` : undefined,
    skipped.length
      ? `Left existing files untouched: ${skipped.join(", ")}.`
      : undefined,
    `Open: ${join(plan.targetPath, "index.html")}`,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}
