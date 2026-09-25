export interface CodingEvalCase {
  readonly id: string;
  readonly title: string;
  readonly requiresMutation: boolean;
  readonly requiresBunInstall?: boolean;
  readonly requiresBuild: boolean;
  readonly requiresAppReady: boolean;
  readonly requiresRuntimeSmoke: boolean;
}

export const CODING_EVAL_CASES = {
  "coding-change-v1": {
    id: "coding-change-v1",
    title: "Verified coding change",
    requiresMutation: true,
    requiresBuild: true,
    requiresAppReady: false,
    requiresRuntimeSmoke: false,
  },
  "coding-app-handoff-v1": {
    id: "coding-app-handoff-v1",
    title: "Coding change with running app handoff",
    requiresMutation: true,
    requiresBuild: true,
    requiresAppReady: true,
    requiresRuntimeSmoke: false,
  },
  "coding-bun-app-handoff-v1": {
    id: "coding-bun-app-handoff-v1",
    title: "Bun install, verified build, and running app handoff",
    requiresMutation: true,
    requiresBunInstall: true,
    requiresBuild: true,
    requiresAppReady: true,
    requiresRuntimeSmoke: false,
  },
  "app-start-v1": {
    id: "app-start-v1",
    title: "Start an existing app",
    requiresMutation: false,
    requiresBuild: false,
    requiresAppReady: true,
    requiresRuntimeSmoke: false,
  },
  "verified-noop-v1": {
    id: "verified-noop-v1",
    title: "Verified no-op response",
    requiresMutation: false,
    requiresBuild: true,
    requiresAppReady: false,
    requiresRuntimeSmoke: false,
  },
  "api-runtime-fix-v1": {
    id: "api-runtime-fix-v1",
    title: "API runtime fix with HTTP smoke receipt",
    requiresMutation: true,
    requiresBuild: true,
    requiresAppReady: false,
    requiresRuntimeSmoke: true,
  },
} as const satisfies Record<string, CodingEvalCase>;

export type CodingEvalCaseId = keyof typeof CODING_EVAL_CASES;

export interface CodingEvalTask {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly caseId: CodingEvalCaseId;
}

export interface CodingEvalSuite {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly tasks: readonly CodingEvalTask[];
}

/**
 * Benchmark prompts are immutable within a suite version. Change the suite ID
 * when task wording or acceptance intent changes so old reports stay comparable.
 */
export const CODING_EVAL_SUITES = {
  "coding-harness-v1": {
    id: "coding-harness",
    version: 1,
    title: "Doolittle coding harness baseline",
    tasks: [
      {
        id: "nextjs-shadcn-blog",
        title: "Build and launch a Bun-backed Next.js blog",
        caseId: "coding-bun-app-handoff-v1",
        prompt:
          "Create a polished one-page blog app in Next.js using shadcn/ui components in the current workspace. Do not switch workspaces or write outside it. Use Bun to install dependencies and include a dev script so `bun run dev` starts the app. Run a production build, start it with Doolittle's managed app handoff, and report the verified local URL and checks.",
      },
    ],
  },
} as const satisfies Record<string, CodingEvalSuite>;

export type CodingEvalSuiteId = keyof typeof CODING_EVAL_SUITES;

export function findCodingEvalTask(
  suiteId: string,
  taskId: string,
): CodingEvalTask | undefined {
  const suite = CODING_EVAL_SUITES[suiteId as CodingEvalSuiteId];
  return suite?.tasks.find((task) => task.id === taskId);
}
