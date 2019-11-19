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

export type {ClientConfig} from './RSocketClient';

export type {Entry} from './CompositeMetadata';

export type {ServerConfig, TransportServer} from './RSocketServer';

export type {Encodable} from 'rsocket-types';

export type {Encoder, Encoders} from './RSocketEncoding';

export type {Serializer, PayloadSerializers} from './RSocketSerialization';

import RSocketClient from './RSocketClient';
export {RSocketClient};

import RSocketServer from './RSocketServer';
export {RSocketServer};

import RSocketResumableTransport from './RSocketResumableTransport';
export {RSocketResumableTransport};

import * as WellKnownMimeType from "./WellKnownMimeType";
export {
  WellKnownMimeType
};

export {
  CONNECTION_STREAM_ID,
  ERROR_CODES,
  ERROR_EXPLANATIONS,
  FLAGS_MASK,
  FLAGS,
  FRAME_TYPE_OFFFSET,
  FRAME_TYPES,
  MAX_CODE,
  MAX_KEEPALIVE,
  MAX_LIFETIME,
  MAX_MIME_LENGTH,
  MAX_RESUME_LENGTH,
  MAX_STREAM_ID,
  MAX_VERSION,
  createErrorFromFrame,
  getErrorCodeExplanation,
  isComplete,
  isIgnore,
  isLease,
  isMetadata,
  isNext,
  isRespond,
  isResumeEnable,
  printFrame,
} from './RSocketFrame';
export {
  deserializeFrame,
  deserializeFrameWithLength,
  deserializeFrames,
  serializeFrame,
  serializeFrameWithLength,
} from './RSocketBinaryFraming';
export {
  byteLength,
  createBuffer,
  readUInt24BE,
  toBuffer,
  writeUInt24BE,
} from './RSocketBufferUtils';
export {
  BufferEncoders,
  BufferEncoder,
  Utf8Encoders,
  UTF8Encoder,
} from './RSocketEncoding';
export {
  IdentitySerializer,
  IdentitySerializers,
  JsonSerializer,
  JsonSerializers,
} from './RSocketSerialization';
export type {LeaseStats} from './RSocketLease';
export {Leases, Lease} from './RSocketLease';

export {
  CompositeMetadata,
  ReservedMimeTypeEntry,
  WellKnownMimeTypeEntry,
  ExplicitMimeTimeEntry,
  encodeAndAddCustomMetadata,
  encodeAndAddWellKnownMetadata,
} from './CompositeMetadata';
