import { getEntrypointLogger } from "@/logging/entrypoint-logger";

export function appendBootstrapTrace(message: string, detail?: string): void {
  getEntrypointLogger("bootstrap").trace(`bootstrap:${message}`, detail);
}
