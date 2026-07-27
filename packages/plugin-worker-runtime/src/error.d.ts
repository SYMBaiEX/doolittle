export interface WireError {
  name?: string;
  message?: string;
  stack?: string;
  [key: string]: unknown;
}

export declare function toWireError(error: unknown): WireError;
export declare function fromWireError(value: unknown): Error;
