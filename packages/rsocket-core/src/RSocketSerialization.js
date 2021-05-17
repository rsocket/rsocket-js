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

import {LiteBuffer as Buffer} from './LiteBuffer';
import invariant from './Invariant';

/**
 * A Serializer transforms data between the application encoding used in
 * Payloads and the Encodable type accepted by the transport client.
 */
export type Serializer<T> = {|
  deserialize: (data: ?Encodable) => ?T,
  serialize: (data: ?T) => ?Encodable,
|};

export type PayloadSerializers<D, M> = {|
  data: Serializer<D>,
  metadata: Serializer<M>,
|};

// JSON serializer
export const JsonSerializer: Serializer<*> = {
  deserialize: data => {
    let str;
    if (data == null) {
      return null;
    } else if (typeof data === 'string') {
      str = data;
    } else if (Buffer.isBuffer(data)) {
      const buffer: Buffer = data;
      str = buffer.toString('utf8');
    } else {
      const buffer: Buffer = Buffer.from(data);
      str = buffer.toString('utf8');
    }
    return JSON.parse(str);
  },
  serialize: JSON.stringify,
};

export const JsonSerializers = {
  data: JsonSerializer,
  metadata: JsonSerializer,
};

// Pass-through serializer
export const IdentitySerializer: Serializer<Encodable> = {
  deserialize: data => {
    invariant(
      data == null ||
        typeof data === 'string' ||
        Buffer.isBuffer(data) ||
        data instanceof Uint8Array,
      'RSocketSerialization: Expected data to be a string, Buffer, or ' +
        'Uint8Array. Got `%s`.',
      data,
    );
    return data;
  },
  serialize: data => data,
};

export const IdentitySerializers = {
  data: IdentitySerializer,
  metadata: IdentitySerializer,
};
