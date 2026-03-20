const [, , ...args] = process.argv;

if (args.includes("--help")) {
  console.log("mock-mcp help");
  process.exit(0);
}

if (args[0] === "list-tools" && args.includes("--json")) {
  console.log(
    JSON.stringify([
      {
        name: "echo",
        description: "Echo structured input.",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },
      },
      {
        name: "sum",
        description: "Sum two numbers.",
      },
    ]),
  );
  process.exit(0);
}

if (args[0] === "list-tools") {
  console.log("echo - Echo structured input.");
  console.log("sum - Sum two numbers.");
  process.exit(0);
}

if (args[0] === "call-tool") {
  const tool = args[1];
  const rawInput = args[2] ?? "{}";
  const input = JSON.parse(rawInput) as Record<string, unknown>;

  if (tool === "echo") {
    console.log(JSON.stringify({ echoed: input }));
    process.exit(0);
  }

  if (tool === "sum") {
    const total = Number(input.a ?? 0) + Number(input.b ?? 0);
    console.log(JSON.stringify({ total }));
    process.exit(0);
  }

  console.error(`Unknown tool: ${tool}`);
  process.exit(1);
}

console.log(JSON.stringify({ args }));
