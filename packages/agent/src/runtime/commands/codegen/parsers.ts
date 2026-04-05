export const CODEGEN_RESEARCH_USAGE =
  "Usage: /codegen research <project-name> | type:plugin | apis:api1,api2 | requirements:req1,req2 :: <description>";

export const CODEGEN_PRD_USAGE =
  "Usage: /codegen prd <project-name> | type:plugin | apis:api1,api2 | requirements:req1,req2 :: <description>";

export interface CodegenDescriptor {
  projectName: string;
  targetType: string;
  description: string;
  apis: string[];
  requirements: string[];
}

export function parseCodegenDescriptor(
  payload: string,
): CodegenDescriptor | null {
  const [left, description] = payload.split("::").map((part) => part.trim());
  if (!left || !description) {
    return null;
  }
  const segments = left.split("|").map((part) => part.trim());
  const projectName = segments.shift()?.trim();
  if (!projectName) {
    return null;
  }
  return {
    projectName,
    targetType:
      segments
        .find((part) => part.startsWith("type:"))
        ?.replace("type:", "")
        .trim() ?? "plugin",
    description,
    apis:
      segments
        .find((part) => part.startsWith("apis:"))
        ?.replace("apis:", "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean) ?? [],
    requirements:
      segments
        .find((part) => part.startsWith("requirements:"))
        ?.replace("requirements:", "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean) ?? [],
  };
}
