import { captureHostExecutionBaseline } from "@elizaos/host";

// Capture trusted launch authority before configuration or plugins can mutate it.
captureHostExecutionBaseline();
