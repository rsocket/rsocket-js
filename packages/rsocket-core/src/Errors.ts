export class RSocketError extends Error {
  constructor(readonly code: number | ErrorCodes, message?: string) {
    super(message);
  }
}

export enum ErrorCodes {
  RESERVED = 0x00000000,
  INVALID_SETUP = 0x00000001,
  UNSUPPORTED_SETUP = 0x00000002,
  REJECTED_SETUP = 0x00000003,
  REJECTED_RESUME = 0x00000004,
  CONNECTION_CLOSE = 0x00000102,
  CONNECTION_ERROR = 0x00000101,
  APPLICATION_ERROR = 0x00000201,
  REJECTED = 0x00000202,
  CANCELED = 0x00000203,
  INVALID = 0x00000204,
  RESERVED_EXTENSION = 0xffffffff,
}
