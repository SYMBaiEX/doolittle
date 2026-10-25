import type { GatewayRunnerBootstrapInputs } from "../bootstrap";
import type { GatewayRunnerOperations } from "../operations";

export interface GatewayRunnerOperationsDelegate {
  receive: GatewayRunnerBootstrapInputs["receive"];
  set: (operations: GatewayRunnerOperations) => void;
}

export function createGatewayRunnerOperationsDelegate(): GatewayRunnerOperationsDelegate {
  let operationsDelegate: GatewayRunnerOperations | undefined;

  return {
    receive: async (message, options) => {
      if (!operationsDelegate) {
        throw new Error("Gateway runner operations are not initialized.");
      }
      return operationsDelegate.receive(message, options);
    },
    set: (operations) => {
      operationsDelegate = operations;
    },
  };
}
