import { describe, expect, it } from "vitest";
import { LOCAL_SHELL, localShellInvocation } from "./shell";

describe("localShellInvocation", () => {
  it("uses the resolved host shell on POSIX", () => {
    expect(localShellInvocation("printf ok", "linux", {})).toEqual({
      executable: LOCAL_SHELL,
      args: ["-lc", "printf ok"],
    });
  });

  it("uses ComSpec and cmd.exe arguments on Windows", () => {
    expect(
      localShellInvocation("echo ok", "win32", {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
      }),
    ).toEqual({
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: ["/D", "/S", "/C", "echo ok"],
    });
  });

  it("falls back to cmd.exe when ComSpec is blank", () => {
    expect(localShellInvocation("echo ok", "win32", { ComSpec: " " })).toEqual({
      executable: "cmd.exe",
      args: ["/D", "/S", "/C", "echo ok"],
    });
  });
});
