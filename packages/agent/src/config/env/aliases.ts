export function stageLegacyApiAliases(env: NodeJS.ProcessEnv): void {
  if (
    env.DOOLITTLE_API_BIND === undefined &&
    env.DOOLITTLE_HOST !== undefined
  ) {
    env.DOOLITTLE_API_BIND = env.DOOLITTLE_HOST;
  }
  if (
    env.DOOLITTLE_API_PORT === undefined &&
    env.DOOLITTLE_PORT !== undefined
  ) {
    env.DOOLITTLE_API_PORT = env.DOOLITTLE_PORT;
  }
}
