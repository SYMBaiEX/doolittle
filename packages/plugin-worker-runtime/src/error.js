export function toWireError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "Error",
    message: String(error),
  };
}

export function fromWireError(value) {
  if (!value || typeof value !== "object") {
    return new Error(String(value));
  }

  const record = value;
  const error = new Error(
    typeof record.message === "string" ? record.message : "Remote worker error",
  );
  if (typeof record.name === "string" && record.name) {
    error.name = record.name;
  }
  if (typeof record.stack === "string" && record.stack) {
    error.stack = record.stack;
  }
  return error;
}
