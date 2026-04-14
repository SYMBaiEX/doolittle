import type { NativeCodeGenerationService } from "../runtime-contracts";
import { type RuntimeLike, resolveMethod } from "./resolve";

type Svc = NativeCodeGenerationService;
const KEY = "codeGeneration";

export async function performEffectiveCodeResearch(
  runtime: RuntimeLike,
  request: Record<string, unknown>,
) {
  return resolveMethod<Svc, "performResearch">(
    runtime,
    KEY,
    "performResearch",
    "code generation research",
  )(request);
}

export async function generateEffectivePrd(
  runtime: RuntimeLike,
  request: Record<string, unknown>,
  research: Record<string, unknown>,
) {
  return resolveMethod<Svc, "generatePRD">(
    runtime,
    KEY,
    "generatePRD",
    "PRD generation",
  )(request, research);
}

export async function performEffectiveCodeQa(
  runtime: RuntimeLike,
  projectPath: string,
) {
  return resolveMethod<Svc, "performQA">(
    runtime,
    KEY,
    "performQA",
    "code generation QA",
  )(projectPath);
}

export async function generateEffectiveCode(
  runtime: RuntimeLike,
  request: Record<string, unknown>,
) {
  return resolveMethod<Svc, "generateCode">(
    runtime,
    KEY,
    "generateCode",
    "code generation service",
  )(request);
}
