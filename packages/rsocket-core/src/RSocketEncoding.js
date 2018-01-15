/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */

'use strict';

import type {Encodable} from './RSocketTypes';

import {byteLength} from './RSocketBufferUtils';
import invariant from 'fbjs/lib/invariant';

/**
 * Commonly used subset of the allowed Node Buffer Encoder types.
 */
export type Encoder<T: Encodable> = {|
  byteLength: (value: Encodable) => number,
  encode: (
    value: Encodable,
    buffer: Buffer,
    start: number,
    end: number,
  ) => number,
  decode: (buffer: Buffer, start: number, end: number) => T,
|};

/**
 * The Encoders object specifies how values should be serialized/deserialized
 * to/from binary.
 */
export type Encoders<T: Encodable> = {|
  data: Encoder<T>,
  dataMimeType: Encoder<string>,
  message: Encoder<string>,
  metadata: Encoder<T>,
  metadataMimeType: Encoder<string>,
  resumeToken: Encoder<T>,
|};

export const UTF8Encoder: Encoder<string> = {
  byteLength: (value: Encodable) => byteLength(value, 'utf8'),
  decode: (buffer: Buffer, start: number, end: number): string => {
    return buffer.toString('utf8', start, end);
  },
  encode: (
    value: Encodable,
    buffer: Buffer,
    start: number,
    end: number,
  ): number => {
    invariant(
      typeof value === 'string',
      'RSocketEncoding: Expected value to be a string, got `%s`.',
      value,
    );
    buffer.write(value, start, end - start, 'utf8');
    return end;
  },
};

export const BufferEncoder: Encoder<Buffer> = {
  byteLength: (value: Encodable) => {
    invariant(
      Buffer.isBuffer(value),
      'RSocketEncoding: Expected value to be a buffer, got `%s`.',
      value,
    );
    return (value: any).length;
  },
  decode: (buffer: Buffer, start: number, end: number): Buffer => {
    return buffer.slice(start, end);
  },
  encode: (
    value: Encodable,
    buffer: Buffer,
    start: number,
    end: number,
  ): number => {
    invariant(
      Buffer.isBuffer(value),
      'RSocketEncoding: Expected value to be a buffer, got `%s`.',
      value,
    );
    (value: any).copy(buffer, start, 0, value.length);
    return end;
  },
};

/**
 * Encode all values as UTF8 strings.
 */
export const Utf8Encoders: Encoders<string> = {
  data: UTF8Encoder,
  dataMimeType: UTF8Encoder,
  message: UTF8Encoder,
  metadata: UTF8Encoder,
  metadataMimeType: UTF8Encoder,
  resumeToken: UTF8Encoder,
};

/**
 * Encode all values as buffers.
 */
export const BufferEncoders: Encoders<Buffer> = {
  data: BufferEncoder,
  dataMimeType: UTF8Encoder,
  message: UTF8Encoder,
  metadata: BufferEncoder,
  metadataMimeType: UTF8Encoder,
  resumeToken: BufferEncoder,
};
