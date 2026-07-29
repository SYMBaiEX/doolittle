import type { EditorProjectCompilerOptions } from "../shared/contracts";

export const MONACO_TS_CONSTANTS = {
  jsx: {
    none: 0,
    preserve: 1,
    react: 2,
    "react-native": 3,
    "react-jsx": 4,
    "react-jsxdev": 5,
  },
  module: {
    commonjs: 1,
    amd: 2,
    umd: 3,
    system: 4,
    es2015: 5,
    esnext: 99,
  },
  moduleResolution: {
    classic: 1,
    node: 2,
    bundler: 2,
  },
  target: {
    es3: 0,
    es5: 1,
    es2015: 2,
    es2016: 3,
    es2017: 4,
    es2018: 5,
    es2019: 6,
    es2020: 7,
    es2022: 99,
    esnext: 99,
  },
} as const;

export function compilerOptionsForMonaco(
  options: EditorProjectCompilerOptions,
): Record<string, unknown> {
  return {
    allowJs: options.allowJs ?? true,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: options.allowSyntheticDefaultImports ?? true,
    baseUrl: options.baseUrl,
    esModuleInterop: options.esModuleInterop ?? true,
    jsx: options.jsx ? MONACO_TS_CONSTANTS.jsx[options.jsx] : undefined,
    module: options.module
      ? MONACO_TS_CONSTANTS.module[options.module]
      : MONACO_TS_CONSTANTS.module.esnext,
    moduleResolution: options.moduleResolution
      ? MONACO_TS_CONSTANTS.moduleResolution[options.moduleResolution]
      : MONACO_TS_CONSTANTS.moduleResolution.node,
    noEmit: true,
    paths: options.paths,
    resolveJsonModule: options.resolveJsonModule ?? true,
    skipLibCheck: options.skipLibCheck ?? true,
    target: options.target
      ? MONACO_TS_CONSTANTS.target[options.target]
      : MONACO_TS_CONSTANTS.target.esnext,
    types: options.types,
  };
}
