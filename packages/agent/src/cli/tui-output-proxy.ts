export function createBlessedOutputProxy(
  stream: NodeJS.WriteStream,
): NodeJS.WriteStream {
  const rawWrite = stream.write.bind(stream);
  return new Proxy(stream, {
    get(target, prop) {
      if (prop === "write") {
        return rawWrite;
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
