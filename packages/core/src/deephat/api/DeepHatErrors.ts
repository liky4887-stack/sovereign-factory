export class DeepHatError extends Error {
  constructor(msg: string, public readonly status: number = 0) {
    super(msg);
    this.name = 'DeepHatError';
  }
}
export class DeepHatNoCredentialsError extends DeepHatError {
  constructor() {
    super('DeepHat: no credentials configured', 401);
    this.name = 'DeepHatNoCredentialsError';
  }
}
export class DeepHatApiError extends DeepHatError {
  constructor(status: number, msg: string) {
    super(msg, status);
    this.name = 'DeepHatApiError';
  }
}
