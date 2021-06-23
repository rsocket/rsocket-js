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

import type {Encodable} from 'rsocket-types';

import {byteLength} from './RSocketBufferUtils';
import invariant from './Invariant';

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
