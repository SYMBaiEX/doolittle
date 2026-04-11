/** Builds a parameterised SET clause for SQLite UPDATE statements. */
export interface AssignmentBuilder {
  push(column: string, value: string | number | null): void;
  readonly assignments: string[];
  readonly values: (string | number | null)[];
}

export function makeAssignmentBuilder(): AssignmentBuilder {
  const assignments: string[] = [];
  const values: (string | number | null)[] = [];
  return {
    push(column, value) {
      assignments.push(`${column} = ?${values.length + 1}`);
      values.push(value);
    },
    get assignments() {
      return assignments;
    },
    get values() {
      return values;
    },
  };
}
