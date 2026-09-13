export class OperationTimeoutError extends Error {
  constructor(message = "Operation timed out") {
    super(message);
    this.name = "OperationTimeoutError";
  }
}

/** Reject when `promise` does not settle within `timeoutMs`. */
export async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  label?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new OperationTimeoutError(
              label ? `${label} timed out after ${timeoutMs}ms` : `Operation timed out after ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
