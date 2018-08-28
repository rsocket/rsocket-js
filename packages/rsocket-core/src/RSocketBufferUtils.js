/** Copyright (c) Facebook, Inc. and its affiliates.
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
 *
 * @flow
 */

'use strict';

/* eslint-disable no-bitwise */

import type {RSocketBuffer} from 'rsocket-types';
import LiteBuffer from './LiteBuffer';
import invariant from 'fbjs/lib/invariant';

export type Encoding = 'ascii' | 'base64' | 'hex' | 'utf8';

/**
 * Mimimum value that would overflow bitwise operators (2^32).
 */
const BITWISE_OVERFLOW = 0x100000000;

/**
 * Read a uint24 from a buffer starting at the given offset.
 */
export function readUInt24BE(buffer: RSocketBuffer, offset: number): number {
  const val1 = buffer.readUInt8(offset) << 16;
  const val2 = buffer.readUInt8(offset + 1) << 8;
  const val3 = buffer.readUInt8(offset + 2);
  return val1 | val2 | val3;
}

/**
 * Writes a uint24 to a buffer starting at the given offset, returning the
 * offset of the next byte.
 */
export function writeUInt24BE(
  buffer: RSocketBuffer,
  value: number,
  offset: number,
): number {
  offset = buffer.writeUInt8(value >>> 16, offset); // 3rd byte
  offset = buffer.writeUInt8(value >>> 8 & 0xff, offset); // 2nd byte
  return buffer.writeUInt8(value & 0xff, offset); // 1st byte
}

/**
 * Read a uint64 (technically supports up to 53 bits per JS number
 * representation).
 */
export function readUInt64BE(buffer: RSocketBuffer, offset: number): number {
  const high = buffer.readUInt32BE(offset);
  const low = buffer.readUInt32BE(offset + 4);
  return high * BITWISE_OVERFLOW + low;
}

/**
 * Write a uint64 (technically supports up to 53 bits per JS number
 * representation).
 */
export function writeUInt64BE(
  buffer: RSocketBuffer,
  value: number,
  offset: number,
): number {
  const high = value / BITWISE_OVERFLOW | 0;
  const low = value % BITWISE_OVERFLOW;
  offset = buffer.writeUInt32BE(high, offset); // first half of uint64
  return buffer.writeUInt32BE(low, offset); // second half of uint64
}

const bufferExists = typeof global !== 'undefined' &&
  global.hasOwnProperty('Buffer');

const BufferImpl = bufferExists ? Buffer : LiteBuffer;

declare function isNodeBuffer(buffer: mixed): boolean %checks
  (buffer instanceof Buffer);
function isNodeBuffer(buffer: mixed) /*: boolean %checks */ {
  return buffer != null &&
    buffer.constructor != null &&
    typeof buffer.constructor.isBuffer === 'function' &&
    buffer.constructor.isBuffer(buffer);
}

function isRSocketBuffer(buffer: mixed) /*: boolean %checks */ {
  return buffer instanceof LiteBuffer || isNodeBuffer(buffer);
}

export const createBuffer = bufferExists ? Buffer.alloc : LiteBuffer.create;

export const isBuffer = isRSocketBuffer;

/**
 * Determine the number of bytes it would take to encode the given data with the
 * given encoding.
 */
export function byteLength(
  data: ?string | RSocketBuffer,
  encoding: Encoding,
): number {
  if (data == null) {
    return 0;
  } else if (isRSocketBuffer(data)) {
    return data.length;
  }
  invariant(typeof data === 'string', 'data must be string');
  return BufferImpl.byteLength(data, encoding);
}

/**
 * Attempts to construct a buffer from the input, throws if invalid.
 */
export function toBuffer(data: mixed): RSocketBuffer {
  // Buffer.from(buffer) copies which we don't want here
  if (isRSocketBuffer(data)) {
    return data;
  }
  invariant(
    data instanceof ArrayBuffer,
    'RSocketBufferUtils: Cannot construct buffer. Expected data to be an ' +
      'arraybuffer, got `%s`.',
    data,
  );
  return BufferImpl.from(data);
}

export function toArrayLike(buffer: RSocketBuffer): Buffer | Uint8Array {
  if (isNodeBuffer(buffer)) {
    return buffer;
  } else if (buffer instanceof LiteBuffer) {
    return buffer.internalBuffer();
  } else {
    throw new TypeError('Unknown buffer type');
  }
}
