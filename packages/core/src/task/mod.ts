export type TaskLogger = Readonly<{
  info: (...values: readonly unknown[]) => void;
  warn: (...values: readonly unknown[]) => void;
  error: (...values: readonly unknown[]) => void;
}>;

export type TaskContext = Readonly<{
  cwd: string;
  logger: TaskLogger;
}>;

export type TaskFunction = (
  context: TaskContext,
) => void | Promise<void>;
