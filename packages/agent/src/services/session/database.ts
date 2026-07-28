import {
  DatabaseSync,
  type SQLInputValue,
  type StatementResultingChanges,
} from "node:sqlite";

export interface SessionStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): {
    changes: number;
    lastInsertRowid: number | bigint;
  };
}

export interface SessionDatabase {
  exec(sql: string): void;
  query(sql: string): SessionStatement;
  close(): void;
}

function sqlValue(value: unknown): SQLInputValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    ArrayBuffer.isView(value)
  ) {
    return value as SQLInputValue;
  }
  throw new TypeError(`Unsupported SQLite bind value: ${typeof value}`);
}

function normalizeChanges(result: StatementResultingChanges): {
  changes: number;
  lastInsertRowid: number | bigint;
} {
  return {
    changes: Number(result.changes),
    lastInsertRowid: result.lastInsertRowid,
  };
}

export class NodeSessionDatabase implements SessionDatabase {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  query(sql: string): SessionStatement {
    const statement = this.database.prepare(sql);
    const values = (params: unknown[]) => params.map(sqlValue);
    return {
      all: (...params) => statement.all(...values(params)),
      get: (...params) => statement.get(...values(params)),
      run: (...params) => normalizeChanges(statement.run(...values(params))),
    };
  }

  close(): void {
    this.database.close();
  }
}
