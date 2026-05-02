export class StrataConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrataConfigError';
  }
}
