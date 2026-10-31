/** Error with an HTTP-style status. Thrown by handlers, mapped by the utils. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
