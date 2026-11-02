import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps native relationship evidence intact without a merge-on-write adapter override", () => {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-native-sql-")),
  );
  try {
    const output = execFileSync(
      process.execPath,
      [resolve("tests/fixtures/sdk-native-sql.mjs")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 20000,
        env: {
          PATH: process.env.PATH,
          HOME: root,
          USERPROFILE: root,
          ELIZA_HOME: root,
          ELIZA_STATE_DIR: root,
          PGLITE_DATA_DIR: join(root, "db"),
          POSTGRES_URL: "",
          DATABASE_URL: "",
          ELIZA_BENCH_DISABLE_DOTENV: "1",
          SECRET_SALT: randomBytes(32).toString("hex"),
        },
      },
    );
    expect(output).toContain("SDK_NATIVE_SQL_OK");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 25000);
