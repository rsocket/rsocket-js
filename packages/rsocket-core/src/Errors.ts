/*
 * Copyright 2021-2022 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
