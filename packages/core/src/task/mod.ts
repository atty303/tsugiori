export type TaskLogger = Readonly<{
  info: (...values: readonly unknown[]) => void;
  warn: (...values: readonly unknown[]) => void;
  error: (...values: readonly unknown[]) => void;
}>;

export type TaskContext<Outputs extends string = never> = Readonly<{
  cwd: string;
  logger: TaskLogger;
  outputs: Readonly<{ set: (name: Outputs, value: string) => Promise<void> }>;
}>;

export type TaskFunction<Outputs extends string = never> =
  & ((context: TaskContext<Outputs>) => void | Promise<void>)
  & Readonly<{ outputNames?: readonly Outputs[] }>;

export type DefinedTask<Outputs extends string> =
  & TaskFunction<Outputs>
  & Readonly<{ outputNames: readonly Outputs[] }>;

export function defineTask<const Names extends readonly string[]>(
  definition: Readonly<{
    outputs: string extends Names[number] ? never : Names;
    run: (context: TaskContext<Names[number]>) => void | Promise<void>;
  }>,
): DefinedTask<Names[number]> {
  const names = [...definition.outputs];
  if (
    new Set(names).size !== names.length ||
    names.some((name) => !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name))
  ) {
    throw new TypeError("Task output names must be valid and unique.");
  }
  const run = (context: TaskContext<Names[number]>) => definition.run(context);
  return Object.assign(run, { outputNames: Object.freeze(names) });
}
