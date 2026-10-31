import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../..");
const target = "packages/agent/src/utils/workspace-commands.ts";
const testFile = "tests/nub-workspace.test.mjs";
const snapshots = new Map<
  string,
  { implementation: string; protectedFiles: Map<string, string> }
>();
const verifier = `import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectWorkspaceCommands as inspect} from '../packages/agent/src/utils/workspace-commands.ts';
const root = '/workspace/doolittle';
test('Nub and Bun keep distinct runner identities',()=>{
  for (const runner of ['nub','bun']) {
    assert.deepEqual(inspect(runner+' run typecheck',root),[{runner,kind:'verification',directory:root,order:0,script:'typecheck'}]);
    assert.equal(inspect(runner+' run build',root)[0]?.kind,'build');
  }
});
test('Nub scoped tests preserve their exact identity',()=>{
  assert.equal(inspect('nub run test:scope tests/boundary/project-access.test.ts',root)[0]?.script,'test:scope tests/boundary/project-access.test.ts');
  assert.equal(inspect('nub --cwd apps/desktop run build',root)[0]?.directory,root+'/apps/desktop');
});
test('masked failures and outside paths are not proof',()=>{
  for (const command of ['nub run test --help','nub run check:release || true','echo "nub run build"','nub run test:scope ../outside.test.ts','nub run check:release > result.txt']) assert.deepEqual(inspect(command,root),[]);
});
`;
function hash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}
/** A private copy of real Doolittle code, never a task against the user's checkout. */
export function seedLiveCodingProject(workspace: string) {
  const source = readFileSync(join(repo, target), "utf8");
  const dispatch = 'runner === "bun" || runner === "nub"';
  if (!source.includes(dispatch))
    throw new Error(
      "Self-hosting fixture needs its Nub dispatch injection updated.",
    );
  const implementation = source.replace(dispatch, 'runner === "bun"');
  mkdirSync(dirname(join(workspace, target)), { recursive: true });
  mkdirSync(join(workspace, "tests"), { recursive: true });
  mkdirSync(join(workspace, "node_modules"), { recursive: true });
  writeFileSync(join(workspace, target), implementation);
  writeFileSync(join(workspace, testFile), verifier);
  writeFileSync(
    join(workspace, "package.json"),
    JSON.stringify({
      name: "doolittle-self-hosting-fixture",
      private: true,
      type: "module",
      scripts: { "test:scope": `node --test ${testFile}` },
    }),
  );
  writeFileSync(
    join(workspace, "AGENTS.md"),
    "This is a private Doolittle coding acceptance workspace. Edit only packages/agent/src/utils/workspace-commands.ts. Preserve package.json, tests and dependencies. Run nub run test:scope to verify.\n",
  );
  cpSync(
    join(repo, "node_modules/shell-quote"),
    join(workspace, "node_modules/shell-quote"),
    { recursive: true },
  );
  const protectedFiles = new Map(
    [
      "package.json",
      "AGENTS.md",
      testFile,
      ...filesIn(join(workspace, "node_modules")),
    ].map((path) => {
      const absolute = resolve(workspace, path);
      return [absolute, hash(readFileSync(absolute))];
    }),
  );
  snapshots.set(workspace, { implementation, protectedFiles });
  return `Work only in ${workspace}. This workspace contains a private copy of Doolittle's real TypeScript workspace-command parser. It stopped recognizing Nub, the package runner used to build Doolittle. Repair ${target} so it recognizes Nub build, typecheck and scoped-test commands while preserving Bun behavior, exact scoped test identity, workspace directories and rejection of masked failures. You have permission to edit only that TypeScript file and run nub run test:scope. Do not modify package.json, AGENTS.md, tests or dependencies. Read the code, make the change using workspace tools, run the test command and report the actual result.`;
}
export function verifyLiveCodingProject(workspace: string) {
  const snapshot = snapshots.get(workspace);
  if (!snapshot)
    throw new Error(
      "The self-hosting fixture was not seeded by this verifier.",
    );
  for (const [path, digest] of snapshot.protectedFiles)
    if (hash(readFileSync(path)) !== digest)
      throw new Error("A protected self-hosting fixture file was changed.");
  if (
    hash(readFileSync(join(workspace, target))) ===
    hash(snapshot.implementation)
  )
    throw new Error("The coding task made no implementation change.");
  execFileSync(process.execPath, ["--test", testFile], {
    cwd: workspace,
    timeout: 15_000,
    stdio: "pipe",
  });
  snapshots.delete(workspace);
  return {
    task: "doolittle-nub-self-hosting-v1",
    implementationChanged: true,
    verifierUnchanged: true,
    dependenciesUnchanged: true,
    parentTestExit: 0,
  };
}
