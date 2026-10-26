import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const implementation =
  "export function sumFinite(values) { return values.reduce((sum, value) => sum + value, 0); }\n";
const verifier = `import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sumFinite} from './sum.mjs';
test('finite numeric inputs only',()=>{assert.equal(sumFinite([1,2,NaN,Infinity,-Infinity,'3',null,{},-1]),2);assert.equal(sumFinite([]),0);assert.equal(sumFinite([0.5,-0.25]),0.25);assert.throws(()=>sumFinite(null),TypeError);assert.throws(()=>sumFinite('12'),TypeError);});
`;
function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function seedLiveCodingProject(workspace: string) {
  writeFileSync(join(workspace, "sum.mjs"), implementation);
  writeFileSync(join(workspace, "verify.test.mjs"), verifier);
  return `Work only in ${workspace}. Repair sum.mjs so sumFinite accepts an array, sums only finite primitive numbers, ignores all other elements, returns zero for an empty array, and throws TypeError for non-array input. You have permission to edit sum.mjs and run node --test verify.test.mjs. Do not modify verify.test.mjs. Make the change using workspace tools, run the tests, and report the result.`;
}
export function verifyLiveCodingProject(workspace: string) {
  if (
    hash(readFileSync(join(workspace, "verify.test.mjs"), "utf8")) !==
    hash(verifier)
  )
    throw new Error("The supplied verifier was changed.");
  if (
    hash(readFileSync(join(workspace, "sum.mjs"), "utf8")) ===
    hash(implementation)
  )
    throw new Error("The coding task made no implementation change.");
  // This independent parent-shell result is authoritative, not the model's reply.
  execFileSync(process.execPath, ["--test", "verify.test.mjs"], {
    cwd: workspace,
    timeout: 15_000,
    stdio: "pipe",
  });
  return {
    implementationChanged: true,
    verifierUnchanged: true,
    parentTestExit: 0,
  };
}
