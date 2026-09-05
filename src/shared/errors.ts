export class ReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadinessError";
  }
}
