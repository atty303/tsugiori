/** Traverses native parallel groups in appearance order, preserving leaf identity. */
export function flattenSteps<T extends { readonly type: string }>(
  steps: readonly T[],
): readonly Exclude<T, { readonly type: "parallel" }>[] {
  const result: T[] = [];
  for (const step of steps) {
    if (step.type === "parallel") {
      result.push(
        ...flattenSteps<T>(
          (step as T & { readonly steps: readonly T[] }).steps,
        ),
      );
    } else result.push(step);
  }
  return result as Exclude<T, { readonly type: "parallel" }>[];
}
