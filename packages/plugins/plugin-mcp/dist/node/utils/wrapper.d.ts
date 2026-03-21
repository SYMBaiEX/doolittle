import { type HandlerCallback, type IAgentRuntime, type Memory, type State } from "@elizaos/core";
import { type ValidationResult } from "../types";
export type Input = string | Record<string, unknown>;
type CreateFeedbackPromptFn = (originalResponse: Input, errorMessage: string, composedState: State, userMessage: string) => string;
export interface WithModelRetryOptions<T> {
    readonly runtime: IAgentRuntime;
    readonly message: Memory;
    readonly state: State;
    readonly input: Input;
    readonly validationFn: (data: Input) => ValidationResult<T>;
    readonly createFeedbackPromptFn: CreateFeedbackPromptFn;
    readonly callback?: HandlerCallback;
    readonly failureMsg?: string;
    readonly retryCount?: number;
}
export declare function withModelRetry<T>({ runtime, message, state, callback, input, validationFn, createFeedbackPromptFn, failureMsg, retryCount, }: WithModelRetryOptions<T>): Promise<T | null>;
export {};
//# sourceMappingURL=wrapper.d.ts.map